import { caretToEndOfElement } from './naver-image-placement.js';
import { documentIssues, editorDocumentIssues, editorSequence } from './article-document.js';

const COMPONENTS = ':is(.se-content, .se-main-container) .se-component';
const PARAGRAPHS = `${COMPONENTS}:not(.se-documentTitle) .se-text-paragraph`;

// A title or an unrelated contenteditable is not evidence that the body is ready.
// SmartEditor editing markup uses se-content; saved documents use se-main-container.
async function editableBody(scope) {
  const paragraphs = scope.locator(PARAGRAPHS);
  for (let i = await paragraphs.count() - 1; i >= 0; i -= 1) {
    const paragraph = paragraphs.nth(i);
    if (!await paragraph.isVisible()) continue;
    if (await paragraph.evaluate((element) => element.isContentEditable && !element.closest('.se-documentTitle'))) return paragraph;
    // Some editor versions activate a span inside the paragraph rather than its parent.
    const children = paragraph.locator('[contenteditable="true"]');
    for (let j = 0; j < await children.count(); j += 1) {
      const input = children.nth(j);
      if (await input.evaluate((element) => {
        const style = element.ownerDocument.defaultView.getComputedStyle(element);
        // An empty inline editing span can have zero width but still hold a caret.
        return element.isContentEditable && style.visibility !== 'hidden' && style.display !== 'none'
          && [...element.getClientRects()].some((rect) => rect.height > 0);
      })) return input;
    }
  }
  return null;
}

function activationAllowed(page, scope, target) {
  try {
    const expected = new URL(target);
    if (expected.origin !== 'https://blog.naver.com' || expected.pathname !== '/PostWriteForm.naver'
      || expected.searchParams.get('blogId') !== 'who-ami' || expected.searchParams.get('logNo')) return false;
    const urls = [page.url(), scope.url()].map((url) => new URL(url));
    if (urls.some((url) => url.hostname === 'blog.naver.com' && (url.searchParams.get('logNo')
      || /Post(?:Update(?:Form)?|View)\.naver/i.test(url.pathname)))) return false;
    return urls.some((url) => url.origin === expected.origin && url.pathname === expected.pathname
      && url.searchParams.get('blogId') === expected.searchParams.get('blogId') && !url.searchParams.get('logNo'));
  } catch { return false; }
}

export async function findNaverEditorScope(page, { timeout = 20000, activationTarget = null } = {}) {
  const deadline = Date.now() + timeout;
  const attempts = new WeakMap();
  do {
    for (const scope of page.frames()) {
      try {
        if (await editableBody(scope)) return scope;
        const tried = attempts.get(scope) || { count: 0, last: 0 };
        if (!activationTarget || !activationAllowed(page, scope, activationTarget) || tried.count >= 3
          || Date.now() - tried.last < 1000) continue;
        // Only focus a verified empty new body. Never change contenteditable attributes,
        // type probes, select all, click saved content, or touch publish controls.
        if (editorSequence(await readNaverEditorBlocks(scope)).length) continue;
        const bodies = scope.locator(PARAGRAPHS);
        for (let i = 0; i < await bodies.count(); i += 1) {
          const body = bodies.nth(i);
          if (!await body.isVisible()) continue;
          attempts.set(scope, { count: tried.count + 1, last: Date.now() });
          await body.click({ timeout: Math.min(1000, Math.max(1, deadline - Date.now())) });
          if (await editableBody(scope)) return scope;
          break;
        }
      } catch { /* A loading frame can detach; failed activation still fails closed. */ }
    }
    if (Date.now() >= deadline) break;
    await page.waitForTimeout(Math.min(250, Math.max(0, deadline - Date.now())));
  } while (Date.now() <= deadline);
  throw Object.assign(new Error('네이버 본문 입력 영역을 찾지 못했습니다.'), { code: 'NAVER_BODY_EDITOR_NOT_FOUND' });
}

// Read editor-owned components, not an HTML clipboard probe. Text paragraphs
// may split differently, but every text run between images must match exactly.
export async function readNaverEditorBlocks(scope) {
  return scope.locator(COMPONENTS).evaluateAll((components) => components.flatMap((component) => {
    if (component.classList.contains('se-documentTitle')) return [];
    if (component.classList.contains('se-image')) return [{ type: 'image' }];
    return [...component.querySelectorAll('.se-text-paragraph')].map((paragraph) => ({ type: 'paragraph', text: paragraph.innerText || paragraph.textContent || '' }));
  }));
}

async function endOfBody(scope) {
  const paragraph = await editableBody(scope);
  if (!paragraph) throw Object.assign(new Error('네이버 본문 입력 영역을 찾지 못했습니다.'), { code: 'NAVER_BODY_EDITOR_NOT_FOUND' });
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
