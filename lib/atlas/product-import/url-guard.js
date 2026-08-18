// ─── Product Import · URL 안전 검사 / 정규화 ───────────────────────────────
// 서버가 사용자 입력 URL을 그대로 fetch하기 전에 통과해야 하는 관문.
// 이 모듈은 PURE (IO 없음)이므로 서버 라우트와 테스트가 같은 규칙을 공유한다.
//
// 막는 것: http/https 이외 스킴, 자격정보가 박힌 URL, localhost·사설망·링크로컬·
// 내부 도메인, 표준 웹 포트가 아닌 포트. 우회 시도(브라우저 자동화·프록시)는
// 하지 않는다 — 차단된 사이트는 차단된 상태로 보고한다.

const ALLOWED_PROTOCOLS = ["http:", "https:"];
const ALLOWED_PORTS = ["", "80", "443", "8080", "8443"];

// 사내망·개발기 이름으로 흔히 쓰여 공개 상품 페이지일 수 없는 호스트들.
const BLOCKED_HOST_EXACT = new Set(["localhost", "localhost.localdomain", "ip6-localhost", "metadata.google.internal"]);
const BLOCKED_HOST_SUFFIX = [".localhost", ".local", ".internal", ".intranet", ".lan", ".home.arpa", ".test", ".example", ".invalid"];

// 클릭 추적 파라미터. 같은 상품이 URL만 달라 두 번 등록되는 것을 막는다.
const TRACKING_PARAMS = [
  /^utm_/i, /^ref$/i, /^ref_$/i, /^referrer$/i, /^fbclid$/i, /^gclid$/i, /^gclsrc$/i,
  /^msclkid$/i, /^igshid$/i, /^mc_[ce]id$/i, /^_ga$/i, /^yclid$/i, /^spm$/i,
  /^srsltid$/i, /^variant_?id$/i, /^pr_prod_strat$/i, /^pr_rec_/i, /^pr_seq$/i, /^pr_ref_pid$/i,
];

function ipv4Parts(host) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  return parts.every((n) => n >= 0 && n <= 255) ? parts : null;
}

/** IPv4 리터럴이 공인 주소가 아닌 대역(사설·루프백·링크로컬·예약)인지 */
export function isPrivateIpv4(host) {
  const p = ipv4Parts(host);
  if (!p) return false;
  const [a, b] = p;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;              // link-local
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0) return true;                // 192.0.0/24, 192.0.2/24
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a === 100 && b >= 64 && b <= 127) return true;    // CGNAT
  if (a >= 224) return true;                            // multicast / reserved
  return false;
}

/**
 * IPv6 리터럴은 전부 막는다. 루프백·ULA·링크로컬은 명백히 내부망이고, 공인
 * IPv6를 그대로 쓴 공개 상품 페이지는 실제로 존재하지 않으므로 호스트명만
 * 받는 편이 SSRF 표면을 넓히지 않는다.
 */
export function isIpv6Literal(host) {
  const raw = String(host || "").replace(/^\[|\]$/g, "").toLowerCase();
  if (!raw.includes(":")) return false;
  // IPv4-mapped (::ffff:10.0.0.1)도 같은 이유로 막히지만, 판정 근거를 남긴다.
  return true;
}

export function isBlockedHost(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/\.$/, "");
  if (!host) return true;
  if (BLOCKED_HOST_EXACT.has(host)) return true;
  if (BLOCKED_HOST_SUFFIX.some((s) => host.endsWith(s))) return true;
  if (isPrivateIpv4(host)) return true;
  if (isIpv6Literal(host)) return true;
  // 점이 없는 호스트는 사내 단일 라벨 이름 — 공개 상품 페이지가 아니다.
  if (!host.includes(".")) return true;
  return false;
}

/**
 * fetch해도 되는 URL인지 판정한다.
 * @returns {{ok:true, url:URL, host:string} | {ok:false, error:string}}
 */
export function assertFetchableUrl(raw) {
  const text = String(raw || "").trim();
  if (!text) return { ok: false, error: "상품 URL을 입력하세요." };

  let url;
  try {
    url = new URL(text);
  } catch {
    return { ok: false, error: "URL 형식이 아닙니다. https:// 로 시작하는 주소를 넣어주세요." };
  }
  if (!ALLOWED_PROTOCOLS.includes(url.protocol)) {
    return { ok: false, error: "http/https 주소만 가져올 수 있습니다." };
  }
  if (url.username || url.password) {
    return { ok: false, error: "자격정보가 포함된 URL은 가져오지 않습니다." };
  }
  if (!ALLOWED_PORTS.includes(url.port)) {
    return { ok: false, error: `허용되지 않은 포트입니다 (${url.port}).` };
  }
  if (isBlockedHost(url.hostname)) {
    return { ok: false, error: "내부망·사설 IP·localhost 주소는 가져올 수 없습니다." };
  }
  return { ok: true, url, host: url.hostname.toLowerCase() };
}

/**
 * 중복 판정에 쓰는 canonical 형태. 추적 파라미터·해시·끝 슬래시를 없애고
 * 호스트의 www. 를 떼어 같은 상품이 두 레코드가 되지 않게 한다.
 */
export function canonicalizeProductUrl(raw) {
  const checked = assertFetchableUrl(raw);
  if (!checked.ok) return "";
  const url = new URL(checked.url.toString());
  url.hash = "";
  url.username = "";
  url.password = "";
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.some((re) => re.test(key))) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  const query = url.searchParams.toString();
  const path = url.pathname.replace(/\/+$/, "") || "/";
  return `${url.protocol}//${url.host}${path}${query ? `?${query}` : ""}`;
}

/** 판매처 자동 감지 — 도메인에서 사람이 읽는 이름을 뽑는다. 없으면 빈 문자열. */
export function vendorFromUrl(raw) {
  const checked = assertFetchableUrl(raw);
  if (!checked.ok) return "";
  const host = checked.url.hostname.toLowerCase().replace(/^www\./, "");
  const label = host.split(".")[0];
  if (!label) return "";
  return label.charAt(0).toUpperCase() + label.slice(1);
}
