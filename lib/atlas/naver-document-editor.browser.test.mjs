import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import { chromium } from 'playwright-core';
import { createKoreaDocument, editorDocumentIssues } from './article-document.js';
import { insertNaverDocument, readNaverEditorBlocks, findNaverEditorScope } from './naver-document-editor.js';

const executablePath = process.env.ATLAS_NAVER_BROWSER_PATH;
const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/bedding-review.json', import.meta.url)));
const html = '<div class="se-main-container"><div class="se-component se-documentTitle">제목 보호</div><div class="se-component" contenteditable="true"><p class="se-text-paragraph"><br></p></div></div>';

test('native editor adapter inserts all three images at their headings and fails closed on displaced uploads', { skip: !executablePath }, async () => {
  const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    const page = await browser.newPage();
    const document = createKoreaDocument(fixture);
    await page.setContent(html);
    const result = await insertNaverDocument(page, page, document, { uploadImage: async () => {
      await page.evaluate(() => {
        const body = window.document.querySelector('.se-main-container');
        const image = window.document.createElement('div');
        image.className = 'se-component se-image';
        body.append(image);
        const text = window.document.createElement('div');
        text.className = 'se-component';
        text.contentEditable = 'true';
        text.innerHTML = '<p class="se-text-paragraph"><br></p>';
        body.append(text);
      });
    } });
    assert.equal(result.uploaded, 3);
    assert.equal(result.documentVerified, true);
    assert.deepEqual(editorDocumentIssues(document, await readNaverEditorBlocks(page)), []);
    assert.equal(await page.locator('.se-documentTitle').innerText(), '제목 보호');
    await page.setContent(html);
    await assert.rejects(() => insertNaverDocument(page, page, document, { uploadImage: async () => {
      await page.evaluate(() => {
        const image = window.document.createElement('div');
        image.className = 'se-component se-image';
        window.document.querySelector('.se-main-container').prepend(image);
      });
    } }), { code: 'NAVER_INLINE_IMAGE_UNVERIFIED' });
  } finally { await browser.close(); }
});

test('editor scope waits for an editable iframe body and ignores title-only, hidden and readonly probes', { skip: !executablePath }, async () => {
  const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    const page = await browser.newPage();
    await page.setContent('<div class="se-documentTitle" contenteditable="true">제목</div><iframe></iframe>');
    const frame = page.frames()[1];
    await frame.setContent(html.replace('se-main-container', 'se-content').replace('contenteditable="true"', 'contenteditable="false"'));
    await assert.rejects(findNaverEditorScope(page, { timeout: 100 }), { code: 'NAVER_BODY_EDITOR_NOT_FOUND' });
    await frame.locator('.se-component:not(.se-documentTitle)').evaluate((element) => { element.contentEditable = 'true'; element.style.display = 'none'; });
    await assert.rejects(findNaverEditorScope(page, { timeout: 100 }), { code: 'NAVER_BODY_EDITOR_NOT_FOUND' });
    const ready = findNaverEditorScope(page, { timeout: 2000 });
    await frame.evaluate(() => setTimeout(() => { window.document.querySelector('.se-component:not(.se-documentTitle)').style.display = ''; }, 150));
    assert.equal(await ready, frame);
    const document = createKoreaDocument(fixture);
    const result = await insertNaverDocument(page, frame, document, { uploadImage: async () => {
      await frame.evaluate(() => {
        const root = window.document.querySelector('.se-content');
        root.insertAdjacentHTML('beforeend', '<div class="se-component se-image"></div><div class="se-component" contenteditable="true"><p class="se-text-paragraph"><br></p></div>');
      });
    } });
    assert.equal(result.uploaded, 3);
    assert.deepEqual(editorDocumentIssues(document, await readNaverEditorBlocks(frame)), []);
    await frame.setContent(html.replace('se-main-container', 'se-content').replace('<br>', '복구된 본문'));
    await assert.rejects(insertNaverDocument(page, frame, document, { uploadImage: () => assert.fail('existing body must be protected') }), { code: 'NAVER_NEW_EDITOR_NOT_EMPTY' });
  } finally { await browser.close(); }
});
