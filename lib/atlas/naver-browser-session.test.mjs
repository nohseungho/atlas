import { diagnoseOpenNaverEditors } from '../../scripts/naver-editor-diagnose.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { chromium } from 'playwright-core';
import { naverSessionEndpoint, openNaverBrowserSession } from './naver-browser-session.js';
import { createKoreaDocument, editorDocumentIssues } from './article-document.js';
import { insertNaverDocument, readNaverEditorBlocks } from './naver-document-editor.js';

test('session discovery accepts only a loopback port and browser path from the ATLAS profile', () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-session-endpoint-'));
  try {
    assert.equal(naverSessionEndpoint(profile), null);
    for (const value of ['0\n/devtools/browser/abc', '65536\n/devtools/browser/abc', '9222\nws://other-host/browser', '9222\n/devtools/page/abc']) {
      fs.writeFileSync(path.join(profile, 'DevToolsActivePort'), value);
      assert.equal(naverSessionEndpoint(profile), null);
    }
    fs.writeFileSync(path.join(profile, 'DevToolsActivePort'), '9222\r\n/devtools/browser/abc-123\r\n');
    assert.equal(naverSessionEndpoint(profile), 'ws://127.0.0.1:9222/devtools/browser/abc-123');
  } finally { fs.rmSync(profile, { recursive: true, force: true }); }
});

test('a closed session falls back to the same profile; an old locked profile fails without killing its browser', async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-session-stale-'));
  try {
    fs.writeFileSync(path.join(profile, 'DevToolsActivePort'), '9222\n/devtools/browser/closed');
    let launchedProfile;
    const fake = { connectOverCDP: async () => { throw new Error('closed'); }, launchPersistentContext: async (value) => { launchedProfile = value; return { close: async () => {} }; } };
    const result = await openNaverBrowserSession(fake, profile, { args: [] });
    assert.equal(launchedProfile, profile);
    assert.equal(result.reused, false);
    fake.launchPersistentContext = async () => { throw new Error('ProcessSingleton: profile in use'); };
    await assert.rejects(openNaverBrowserSession(fake, profile, {}), { code: 'NAVER_PROFILE_IN_USE' });
  } finally { fs.rmSync(profile, { recursive: true, force: true }); }
});

test('a retained browser can be reattached with its cookies and review tab intact, then disconnected safely', { skip: !process.env.ATLAS_NAVER_BROWSER_PATH }, async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-session-browser-'));
  let owner;
  let attached;
  try {
    owner = await openNaverBrowserSession(chromium, profile, { executablePath: process.env.ATLAS_NAVER_BROWSER_PATH, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    await owner.context.addCookies([{ name: 'atlas-test', value: 'retained', domain: 'atlas.local', path: '/' }]);
    const review = await owner.context.newPage();
    await review.setContent('<h1>review remains open</h1>');
    assert.ok(naverSessionEndpoint(profile));
    attached = await openNaverBrowserSession(chromium, profile, {});
    assert.equal(attached.reused, true);
    assert.equal((await attached.context.cookies()).find((cookie) => cookie.name === 'atlas-test')?.value, 'retained');
    const next = await attached.context.newPage();
    await next.setContent('<div class="se-content"><div class="se-component se-documentTitle">new job</div><div class="se-component" contenteditable="true"><p class="se-text-paragraph"><br></p></div></div>');
    const document = createKoreaDocument(JSON.parse(fs.readFileSync(new URL('./fixtures/bedding-review.json', import.meta.url))));
    const inserted = await insertNaverDocument(next, next, document, { uploadImage: async () => {
      await next.evaluate(() => window.document.querySelector('.se-content').insertAdjacentHTML('beforeend', '<div class="se-component se-image"></div><div class="se-component" contenteditable="true"><p class="se-text-paragraph"><br></p></div>'));
    } });
    assert.equal(inserted.uploaded, 3);
    assert.deepEqual(editorDocumentIssues(document, await readNaverEditorBlocks(next)), []);
    await next.route('https://blog.naver.com/**', (route) => route.fulfill({ contentType: 'text/html', body: '<div class="se-content"><div class="se-component"><p class="se-text-paragraph"><span class="se-placeholder">글감과 함께 나의 일상을 기록해보세요!</span></p></div></div><iframe></iframe>' }));
    await next.goto('https://blog.naver.com/PostWriteForm.naver?blogId=who-ami');
    const beforeHtml = await next.content();
    const beforePages = owner.context.pages().length;
    const diagnostic = await diagnoseOpenNaverEditors(chromium, profile);
    assert.equal(diagnostic.readOnly, true);
    assert.equal(diagnostic.editors.length, 1);
    const frame = diagnostic.editors[0].frames[0];
    assert.equal(frame.newPostTarget, true);
    assert.equal(frame.bodyDetails[0].placeholders, 1);
    assert.ok(frame.bodyDetails[0].textLength > 0);
    assert.equal(JSON.stringify(diagnostic).includes('글감과 함께'), false, 'diagnostics do not expose text');
    assert.equal(await next.content(), beforeHtml);
    assert.equal(owner.context.pages().length, beforePages);
    await attached.release(); attached = null;
    assert.equal(await review.locator('h1').innerText(), 'review remains open');
    assert.equal(owner.context.pages().length >= 2, true);
  } finally {
    if (attached) await attached.release();
    if (owner) await owner.release();
    fs.rmSync(profile, { recursive: true, force: true });
  }
});
