import { naverEditorTarget } from './korea-product-pipeline.js';
import { assertNewPost } from './publish-transaction.js';
import { findNaverEditorScope } from './naver-document-editor.js';

export function assertLiveNaverNewEditor(page, scope, draft) {
  assertNewPost(draft);
  naverEditorTarget(draft);
  const locations = [page.url(), scope.url()];
  const urls = locations.map((location) => { try { return new URL(location); } catch { return null; } });
  if (urls.some((url) => url?.hostname === 'blog.naver.com' && (/Post(?:Update(?:Form)?|View)\.naver/i.test(url.pathname) || url.searchParams.get('logNo')))
    || !urls.some((url) => url?.hostname === 'blog.naver.com' && url.pathname === '/PostWriteForm.naver' && url.searchParams.get('blogId') === draft.blogId && !url.searchParams.get('logNo'))) {
    throw Object.assign(new Error('현재 화면이 승인된 블로그의 빈 새 글쓰기 주소가 아닙니다. 입력을 중단했습니다.'), { code: 'NAVER_LIVE_WRITE_TARGET_INVALID' });
  }
}

export async function naverEditorDiagnostics(page) {
  const frames = [];
  for (const frame of page.frames()) {
    try {
      const url = new URL(frame.url());
      frames.push({ location: `${url.origin}${url.pathname}`, ...await frame.evaluate(() => ({
        contentContainers: document.querySelectorAll('.se-content').length,
        mainContainers: document.querySelectorAll('.se-main-container').length,
        components: document.querySelectorAll('.se-component').length,
        paragraphs: document.querySelectorAll('.se-text-paragraph').length,
        bodyParagraphs: document.querySelectorAll('.se-component:not(.se-documentTitle) .se-text-paragraph').length,
        visibleEditableNodes: [...document.querySelectorAll('[contenteditable]')].filter((element) => element.isContentEditable && element.getClientRects().length).length,
        bodyEditableDescendants: document.querySelectorAll('.se-component:not(.se-documentTitle) .se-text-paragraph [contenteditable="true"]').length,
        activeElement: { tag: document.activeElement?.tagName || null, classes: String(document.activeElement?.className || '').slice(0, 200),
          editable: Boolean(document.activeElement?.isContentEditable) },
        editableParagraphs: [...document.querySelectorAll('.se-text-paragraph')].filter((element) => element.isContentEditable && !element.closest('.se-documentTitle')).length,
      })) });
    } catch { frames.push({ unavailable: true }); }
  }
  return { frames };
}

// Login can redirect to the blog home after an intermediate write-form URL.
// Navigation is complete only when the editable body has actually loaded.
export async function openNaverNewEditor(page, draft, {
  navigate = (target) => page.goto(target, { waitUntil: 'domcontentloaded', timeout: 45000 }),
  waitForLogin = async () => {},
  dismissPopups = async () => {},
  bodyTimeout = 20000,
  progress = () => {},
} = {}) {
  assertNewPost(draft);
  const target = naverEditorTarget(draft);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    progress(`네이버 새 글쓰기 화면으로 이동합니다 (${attempt + 1}/3).`);
    await navigate(target);
    await waitForLogin();
    await dismissPopups();
    try {
      const scope = await findNaverEditorScope(page, { timeout: bodyTimeout, activationTarget: target });
      assertLiveNaverNewEditor(page, scope, draft);
      progress('네이버 본문 입력 영역을 확인했습니다. 검수된 글과 이미지를 넣습니다.');
      return scope;
    } catch (error) {
      if (error.code !== 'NAVER_BODY_EDITOR_NOT_FOUND') throw error;
      const url = new URL(page.url());
      // Never retry a populated editor or an existing post. Only recover a
      // confirmed navigation back to this blog's home, without typing there.
      const home = url.hostname === 'blog.naver.com' && (
        url.pathname.replace(/\/$/, '') === `/${draft.blogId}`
        || url.pathname === '/PostList.naver' && url.searchParams.get('blogId') === draft.blogId
      );
      if (!home) throw error;
      if (attempt === 2) throw Object.assign(new Error('로그인 후 새 글쓰기 화면으로 이동하지 못하고 블로그 홈으로 돌아왔습니다. 현재 Edge 화면을 확인하세요.'), { code: 'NAVER_EDITOR_NAVIGATION_FAILED' });
      progress('로그인 후 블로그 홈으로 돌아왔습니다. 새 글쓰기 화면을 다시 엽니다.');
    }
  }
}
