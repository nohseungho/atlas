import { readPublicSource } from "../unified-evidence.js";

// The domestic blog recommends household convenience solutions. A deal feed's
// popularity alone is not evidence that food, fashion or car accessories fit it.
export function isHomeConvenienceProduct(candidate) {
  const name = String(candidate?.name || "");
  if (/와인|맥주|소주|식품|식료|쌀|햅쌀|과일|육류|고기|건강식품|영양제|화장품|향수|방향제|장갑|의류|신발|자동차|차량용|차량용품|유아|장난감/i.test(name)) return false;
  return /수납|정리|선반|레일|인출|거치|멀티탭|콘센트|청소|세척|건조|제습|습도|방충|문풍지|가습|온도계|센서|수도|분리수거|조명|라이트|램프|랜턴|스탠드|LED|전기|무선|자동|밀폐|보관|스마트|로봇|타이머|리모컨|주방|생활가전|충전/i.test(name);
}

// Ppomppu's public page may disclose an outbound seller link as a base64
// target. It is only a candidate: product-import checks the actual offer,
// price and redirects before any draft is created.
export function sellerUrlFromPpomppu(html) {
  for (const match of String(html).matchAll(/[?&]target=([A-Za-z0-9+/=%]+)/g)) {
    try {
      const decoded = Buffer.from(decodeURIComponent(match[1]), "base64").toString("utf8");
      const url = new URL(decoded);
      if (["https:", "http:"].includes(url.protocol) && !url.username && !url.password
          && url.hostname !== "ppomppu.co.kr" && !url.hostname.endsWith(".ppomppu.co.kr")) return url.toString();
    } catch { /* Ignore malformed links. */ }
  }
  return "";
}

export async function sellerUrlForCandidate(candidate) {
  try {
    const url = new URL(candidate.sourceUrl);
    if (!["ppomppu.co.kr", "www.ppomppu.co.kr"].includes(url.hostname)) return "";
    return sellerUrlFromPpomppu(await readPublicSource(candidate.sourceUrl, "ppomppu.co.kr"));
  } catch { return ""; }
}
