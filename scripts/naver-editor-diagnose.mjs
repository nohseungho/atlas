import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';
import { chromium } from 'playwright-core';
import { naverSessionEndpoint } from '../lib/atlas/naver-browser-session.js';
import { naverEditorDiagnostics } from '../lib/atlas/naver-editor-navigation.js';

// Read the already-open ATLAS browser only. No launch, navigation, login,
// focus, typing, uploads, publication or changes to draft/session files.
export async function diagnoseOpenNaverEditors(browserDriver, profile) {
  const endpoint = naverSessionEndpoint(profile);
  if (!endpoint) throw new Error('열린 ATLAS Edge 연결 정보를 찾지 못했습니다. 브라우저를 새로 열거나 로그인하지 않았습니다.');
  const browser = await browserDriver.connectOverCDP(endpoint, { timeout: 3000 });
  try {
    const editors = [];
    for (const context of browser.contexts()) for (const page of context.pages()) {
      let url;
      try { url = new URL(page.url()); } catch { continue; }
      if (url.origin !== 'https://blog.naver.com' || url.pathname !== '/PostWriteForm.naver'
        || url.searchParams.get('blogId') !== 'who-ami' || url.searchParams.get('logNo')) continue;
      editors.push(await naverEditorDiagnostics(page));
    }
    if (!editors.length) throw new Error('열린 who-ami 새 글 편집기가 없습니다. 기존 공개 글과 다른 탭은 건드리지 않았습니다.');
    return { mode: 'diagnose', readOnly: true, checkedAt: new Date().toISOString(), editors };
  } finally { await browser.close(); } // CDP disconnect preserves the browser.
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const profile = String(process.env.ATLAS_NAVER_PROFILE_DIR || '').trim() || path.join(os.homedir(), '.atlas', 'naver-profile');
  diagnoseOpenNaverEditors(chromium, profile).then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => { console.error(error.message); process.exitCode = 1; });
}
