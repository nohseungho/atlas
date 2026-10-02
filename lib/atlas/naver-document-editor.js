import { caretToEndOfElement } from './naver-image-placement.js';
import { documentIssues, editorDocumentIssues, editorSequence } from './article-document.js';

// Read editor-owned components, not an HTML clipboard probe. Text paragraphs
// may split differently, but every text run between images must match exactly.
export async function readNaverEditorBlocks(scope) {
  return scope.locator('.se-main-container .se-component').evaluateAll((components) => components.flatMap((component) => {
    if (component.classList.contains('se-documentTitle')) return [];
    if (component.classList.contains('se-image')) return [{ type: 'image' }];
    return [...component.querySelectorAll('.se-text-paragraph')].map((paragraph) => ({ type: 'paragraph', text: paragraph.innerText || paragraph.textContent || '' }));
  }));
}

async function endOfBody(scope) {
  const paragraphs = scope.locator('.se-main-container .se-component:not(.se-documentTitle) .se-text-paragraph');
  const count = await paragraphs.count();
  if (!count) throw Object.assign(new Error('네이버 본문 입력 영역을 찾지 못했습니다.'), { code: 'NAVER_BODY_EDITOR_NOT_FOUND' });
  const paragraph = paragraphs.nth(count - 1);
  const caret = await paragraph.evaluate(caretToEndOfElement);
  if (!caret.ok) throw Object.assign(new Error('본문 끝에 입력 위치를 놓지 못했습니다.'), { code: 'NAVER_CARET_UNVERIFIED' });
  return paragraph;
}

export async function insertNaverDocument(page, scope, document, { uploadImage, exists = () => true } = {}) {
  const issues = documentIssues(document);
  for (const block of document.blocks) if (block.type === 'image' && (!block.src || !exists(block.src))) issues.push(`이미지 ${block.assetId} 파일이 없습니다.`);
  if (issues.length) throw Object.assign(new Error(issues[0]), { code: 'NAVER_DOCUMENT_INVALID', issues });
  // A new post starts empty. Never use Select All: native contenteditable can
  // delete its only paragraph, and restored/editor-owned content must be protected.
  if (editorSequence(await readNaverEditorBlocks(scope)).length) throw Object.assign(new Error('새 글 편집기에 기존 본문이 남아 있습니다. 빈 새 글 편집기로 돌아가세요.'), { code: 'NAVER_NEW_EDITOR_NOT_EMPTY' });
  await endOfBody(scope);
  const inserted = [];
  for (const block of document.blocks) {
    if (block.type === 'image') {
      await endOfBody(scope);
      await uploadImage(block.src);
      inserted.push(block);
      const actual = await readNaverEditorBlocks(scope);
      const partial = editorDocumentIssues({ ...document, blocks: inserted }, actual);
      if (partial.length) throw Object.assign(new Error(partial[0]), { code: 'NAVER_INLINE_IMAGE_UNVERIFIED' });
    } else {
      const paragraph = await endOfBody(scope);
      // A separate text block after an image must exist. If SmartEditor does
      // not provide one, refuse to continue rather than type above the image.
      const actual = await readNaverEditorBlocks(scope);
      if (inserted.at(-1)?.type === 'image' && actual.at(-1)?.type === 'image') {
        throw Object.assign(new Error('이미지 아래의 본문 입력 줄을 찾지 못했습니다.'), { code: 'NAVER_BODY_AFTER_IMAGE_MISSING' });
      }
      await paragraph.press('Enter');
      if (block.type === "heading") await page.keyboard.press(process.platform === "darwin" ? "Meta+B" : "Control+B");
      await page.keyboard.insertText(block.href ? `${block.text}\n${block.href}` : block.text);
      if (block.type === "heading") await page.keyboard.press(process.platform === "darwin" ? "Meta+B" : "Control+B");
      inserted.push(block.href ? { ...block, text: `${block.text}\n${block.href}` } : block);
    }
  }
  const actual = await readNaverEditorBlocks(scope);
  const finalIssues = editorDocumentIssues({ ...document, blocks: inserted }, actual);
  if (finalIssues.length) throw Object.assign(new Error(finalIssues[0]), { code: 'NAVER_DOCUMENT_MISMATCH', issues: finalIssues });
  return { uploaded: inserted.filter((block) => block.type === 'image').length, requested: document.blocks.filter((block) => block.type === 'image').length,
    documentVerified: true, blocks: actual, placements: document.blocks.filter((block) => block.type === 'image').map(({ assetId, anchorAfter }) => ({ id: assetId, anchorAfter, skipped: false })) };
}
