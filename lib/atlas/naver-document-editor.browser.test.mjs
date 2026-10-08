import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import { chromium } from 'playwright-core';
import { createKoreaDocument, editorDocumentIssues } from './article-document.js';
import { insertNaverDocument, readNaverEditorBlocks, findNaverEditorScope } from './naver-document-editor.js';
import { openNaverNewEditor, naverEditorDiagnostics, assertLiveNaverNewEditor } from './naver-editor-navigation.js';

const executablePath = process.env.ATLAS_NAVER_BROWSER_PATH;
const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/bedding-review.json', import.meta.url)));
const html = '<div class="se-main-container"><div class="se-component se-documentTitle">제목 보호</div><div class="se-component" contenteditable="true"><p class="se-text-paragraph"><br></p></div></div>';

test('live editor address must be the correct new-post target, even if editable body markup exists elsewhere', () => {
  const draft = { id: 'live-target', blogId: 'who-ami' };
  const target = 'https://blog.naver.com/PostWriteForm.naver?blogId=who-ami';
  const scope = (url) => ({ url: () => url });
  assert.doesNotThrow(() => assertLiveNaverNewEditor(scope(target), scope('about:blank'), draft));
  for (const url of ['https://blog.naver.com/who-ami', `${target}&logNo=224407589323`, 'https://blog.naver.com/PostWriteForm.naver?blogId=other', 'https://blog.naver.com/PostUpdateForm.naver?blogId=who-ami']) {
    assert.throws(() => assertLiveNaverNewEditor(scope(url), scope(url), draft), { code: 'NAVER_LIVE_WRITE_TARGET_INVALID' });
  }
  assert.throws(() => assertLiveNaverNewEditor(scope(target), scope('https://blog.naver.com/PostView.naver?logNo=224407589323'), draft), { code: 'NAVER_LIVE_WRITE_TARGET_INVALID' });
});

test('login home redirects are recovered only until a real blank editor loads; persistent home redirects stop safely', { skip: !executablePath }, async () => {
  const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    const page = await browser.newPage();
    let writes = 0;
    let alwaysHome = false;
    await page.route('https://blog.naver.com/**', async (route) => {
      const write = route.request().url().includes('PostWriteForm.naver');
      if (write) writes += 1;
      await route.fulfill({ contentType: 'text/html; charset=utf-8', body: write && !alwaysHome && writes > 2
        ? html.replace('se-main-container', 'se-content')
        : write ? '<div class="se-documentTitle">제목만 준비됨</div><script>setTimeout(()=>location.href="/who-ami",20)</script>' : '<h1>블로그 홈</h1>' });
    });
    const draft = { id: 'navigation-test', blogId: 'who-ami', logNo: '' };
    const scope = await openNaverNewEditor(page, draft, { bodyTimeout: 150 });
    assert.equal(writes, 3);
    assert.equal(scope, page.mainFrame());
    assert.match(page.url(), /PostWriteForm\.naver/);
    assert.deepEqual((await readNaverEditorBlocks(scope)).map((block) => ({ ...block, text: block.text.trim() })), [{ type: 'paragraph', text: '' }]);
    const diagnostics = await naverEditorDiagnostics(page);
    assert.equal(diagnostics.frames[0].editableParagraphs, 1);
    assert.equal(diagnostics.frames[0].location, 'https://blog.naver.com/PostWriteForm.naver');
    writes = 0; alwaysHome = true;
    await assert.rejects(openNaverNewEditor(page, draft, { bodyTimeout: 150 }), { code: 'NAVER_EDITOR_NAVIGATION_FAILED' });
    assert.equal(writes, 3);
    assert.equal(await page.locator('h1').innerText(), '블로그 홈');
    await assert.rejects(openNaverNewEditor(page, { ...draft, logNo: '224407589323' }), { code: 'EXISTING_POST_PROTECTED' });
    assert.equal(writes, 3);
  } finally { await browser.close(); }
});

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

test('blank new editor activates body by click, supports editable child, and never activates saved/public content', { skip: !executablePath }, async () => {
  const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    const page = await browser.newPage();
    const target = 'https://blog.naver.com/PostWriteForm.naver?blogId=who-ami';
    const inactive = '<div class="se-content"><div class="se-component se-documentTitle"><p class="se-text-paragraph">제목 보호</p></div><div class="se-component"><p class="se-text-paragraph" style="min-height:30px"><span><br></span></p></div></div>';
    await page.route('https://blog.naver.com/**', (route) => route.fulfill({ contentType: 'text/html; charset=utf-8', body: inactive + `<script>
      window.activationClicks=0;
      document.querySelector('.se-component:not(.se-documentTitle) .se-text-paragraph').onclick=function(){window.activationClicks++;this.querySelector('span').contentEditable='true';};
    </script>` }));
    const scope = await openNaverNewEditor(page, { id: 'activation-fixture', blogId: 'who-ami' }, { bodyTimeout: 1000 });
    assert.equal(scope, page.mainFrame());
    assert.equal(await page.evaluate(() => window.activationClicks), 1);
    assert.equal(await page.locator('.se-component:not(.se-documentTitle) .se-text-paragraph').evaluate((element) => element.isContentEditable), false);
    assert.equal((await naverEditorDiagnostics(page)).frames[0].bodyEditableDescendants, 1);
    // Real input into the activated child must produce readable editor-owned text.
    await insertNaverDocument(page, scope, { ...createKoreaDocument(fixture), blocks: [{ id: 'activation-text', type: 'paragraph', text: '활성화 후 본문 입력' }] }, { uploadImage: () => assert.fail('no uploads requested') });
    assert.equal((await readNaverEditorBlocks(scope))[0].text.trim(), '활성화 후 본문 입력');
    for (const url of ['https://blog.naver.com/PostView.naver?logNo=224407589323', target + '&logNo=224407589323', target.replace('who-ami', 'other'), target.replace('PostWriteForm', 'PostUpdateForm')]) {
      await page.goto(url);
      await assert.rejects(findNaverEditorScope(page, { timeout: 100, activationTarget: target }), { code: 'NAVER_BODY_EDITOR_NOT_FOUND' });
      assert.equal(await page.evaluate(() => window.activationClicks), 0);
    }
    await page.goto(target);
    await page.locator('.se-component:not(.se-documentTitle) span').evaluate((element) => { element.textContent = '복구된 원고'; });
    await assert.rejects(findNaverEditorScope(page, { timeout: 100, activationTarget: target }), { code: 'NAVER_BODY_EDITOR_NOT_FOUND' });
    assert.equal(await page.evaluate(() => window.activationClicks), 0);
    assert.equal(await page.locator('.se-component:not(.se-documentTitle) span').innerText(), '복구된 원고');
    await page.goto(target);
    await page.locator('.se-component:not(.se-documentTitle) .se-text-paragraph').evaluate((element) => { element.onclick = null; });
    await assert.rejects(findNaverEditorScope(page, { timeout: 100, activationTarget: target }), { code: 'NAVER_BODY_EDITOR_NOT_FOUND' });
    assert.equal(await page.locator('[contenteditable="true"]').count(), 0, 'adapter never manufactures editability');
  } finally { await browser.close(); }
});

test('native blank input iframe is accepted only after body activation and every insertion must reach rendered components', { skip: !executablePath }, async () => {
  const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    const page = await browser.newPage();
    const target = 'https://blog.naver.com/PostWriteForm.naver?blogId=who-ami';
    const proxyHtml = '<div class="se-content"><div class="se-component se-documentTitle"><p class="se-text-paragraph">제목 보호</p></div><div class="se-component"><p class="se-text-paragraph" style="min-height:30px"><br></p></div></div><iframe></iframe>';
    await page.route('https://blog.naver.com/**', (route) => route.fulfill({ contentType: 'text/html; charset=utf-8', body: proxyHtml }));
    await page.goto(target);
    await page.evaluate(() => {
      const frame = document.querySelector('iframe');
      const input = frame.contentDocument.body;
      input.contentEditable = 'true';
      window.syncInput = true;
      let selected;
      input.oninput = () => { if (window.syncInput && selected) selected.innerText = input.innerText; };
      document.querySelector('.se-content').onclick = (event) => {
        const paragraph = event.target.closest('.se-component:not(.se-documentTitle) .se-text-paragraph');
        if (!paragraph) return;
        selected = paragraph;
        input.innerText = paragraph.innerText.trim();
        input.focus();
        const range = frame.contentDocument.createRange(); range.selectNodeContents(input); range.collapse(false);
        const selection = frame.contentWindow.getSelection(); selection.removeAllRanges(); selection.addRange(range);
      };
    });
    const scope = await findNaverEditorScope(page, { timeout: 1000, activationTarget: target });
    assert.equal(scope, page.mainFrame(), 'rendered parent remains the document scope');
    const diagnostics = await naverEditorDiagnostics(page);
    assert.equal(diagnostics.frames[0].bodyEditableDescendants, 0);
    assert.equal(diagnostics.frames[0].activeElement.tag, 'IFRAME');
    const document = createKoreaDocument(fixture);
    const result = await insertNaverDocument(page, scope, document, { uploadImage: async () => {
      await page.evaluate(() => window.document.querySelector('.se-content').insertAdjacentHTML('beforeend', '<div class="se-component se-image"></div><div class="se-component"><p class="se-text-paragraph" style="min-height:30px"><br></p></div>'));
    } });
    assert.equal(result.uploaded, 3);
    assert.deepEqual(editorDocumentIssues(document, await readNaverEditorBlocks(scope)), []);
    assert.equal(await page.locator('.se-documentTitle').innerText(), '제목 보호');
    // Input transport that does not update the actual document must stop immediately.
    await page.evaluate(() => {
      document.querySelector('.se-content').innerHTML = '<div class="se-component"><p class="se-text-paragraph" style="min-height:30px"><br></p></div>';
      window.syncInput = false;
    });
    await assert.rejects(insertNaverDocument(page, scope, document, { uploadImage: () => assert.fail('no images before text verification') }), { code: 'NAVER_DOCUMENT_MISMATCH' });
    // Never use an unrelated editable iframe on a home, saved or other-blog page.
    for (const url of ['https://blog.naver.com/who-ami', target + '&logNo=224407589323', target.replace('who-ami', 'other')]) {
      await page.goto(url);
      await page.frames()[1].locator('body').evaluate((element) => { element.contentEditable = 'true'; element.focus(); });
      await assert.rejects(findNaverEditorScope(page, { timeout: 100, activationTarget: target }), { code: 'NAVER_BODY_EDITOR_NOT_FOUND' });
    }
  } finally { await browser.close(); }
});
