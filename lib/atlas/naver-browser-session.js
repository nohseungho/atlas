import fs from 'fs';
import path from 'path';

// Only the browser belonging to ATLAS's explicit profile can be reattached.
// The random browser path prevents an old port file from selecting another browser.
export function naverSessionEndpoint(profile) {
  try {
    const [port, browserPath] = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').trim().split(/\r?\n/);
    if (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535 || !/^\/devtools\/browser\/[a-zA-Z0-9-]+$/.test(browserPath || '')) return null;
    return `ws://127.0.0.1:${Number(port)}${browserPath}`;
  } catch { return null; }
}

export async function openNaverBrowserSession(chromium, profile, options) {
  const endpoint = naverSessionEndpoint(profile);
  if (endpoint) {
    let browser;
    try {
      browser = await chromium.connectOverCDP(endpoint, { timeout: 3000 });
      const context = browser.contexts()[0];
      if (!context) throw new Error('No persistent context');
      return { context, reused: true, release: () => browser.close() };
    } catch { if (browser) await browser.close().catch(() => {}); }
  }
  try {
    const context = await chromium.launchPersistentContext(profile, {
      ...options, args: [...(options.args || []), '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0'],
    });
    return { context, reused: false, release: () => context.close() };
  } catch (cause) {
    if (/ProcessSingleton|SingletonLock|user data directory is already in use|profile.*in use/i.test(String(cause.message))) {
      throw Object.assign(new Error('이전 버전의 ATLAS Edge 창이 프로필을 사용 중입니다. 해당 창을 닫으면 같은 프로필로 다시 연결할 수 있습니다.'), { code: 'NAVER_PROFILE_IN_USE', publishAttempted: false, cause });
    }
    throw Object.assign(cause, { publishAttempted: false });
  }
}
