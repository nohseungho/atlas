import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import { chromium } from 'playwright-core';
import { createKoreaDocument, editorDocumentIssues } from './article-document.js';
import { insertNaverDocument, readNaverEditorBlocks } from './naver-document-editor.js';

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
