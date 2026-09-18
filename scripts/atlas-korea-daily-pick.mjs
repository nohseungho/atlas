// 오늘의 국내 수익화 후보 TOP5 + 1위 선정.
// 기존 ATLAS unified 선별 로직(인기 40 / 확인된 할인 30 / 가성비 20 / 출처 10)을 그대로 재사용하고,
// 이미 발행한 상품을 제외한 뒤, 판매처가 쿠팡(파트너스 수익화 가능)인 첫 후보를 1위로 고른다.
// 유료 API 없음. 공개 RSS/게시글만 읽는다. 결과: data/atlas/korea-daily-pick.json
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { collectChannel } from "../lib/atlas/unified-products.js";
import { selectTopFive, exclusionKeys } from "../lib/atlas/unified-selection.js";
import { readPublicSource } from "../lib/atlas/unified-evidence.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));

const CATEGORY_RULES = [
  [/생수|음료|커피|우유|콜라|펩시|사이다|주스|차\b|드링크|비타/i, "음료"],
  [/과일|황금향|사과|배\b|복숭아|귤|한라봉|명절|선물세트|한우|고기|닭|오징어|고등어|라면|밀키트|떡볶이|피자|김치|쌀/i, "식품"],
  [/캡슐|영양제|비타민|오메가|유산균|단백질|프로틴|코큐텐|콜라겐/i, "건강식품"],
  [/청소기|노트북|그램|TV|모니터|이어폰|헤드폰|스피커|충전|케이블|멀티탭|전기|가전|공기청정|제습|에어컨|선풍기|주전자|포트/i, "가전/디지털"],
  [/자켓|후드|패딩|구스|바지|티셔츠|신발|운동화|양말|속옷|의류/i, "패션"],
  [/세정제|세제|샴푸|치약|휴지|물티슈|비누|바디|화장품|선크림|마스크/i, "생활/뷰티"],
  [/RC카|장난감|레고|게임|유아|키즈/i, "완구/유아"],
];
const categoryOf = (name) => CATEGORY_RULES.find(([re]) => re.test(name))?.[1] || "기타";

function merchantOf(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host === "coupang.com" || host.endsWith(".coupang.com")) return "coupang";
    if (host.endsWith("toss.shopping") || host.endsWith("toss.im")) return "toss";
    if (host.endsWith("kakao.com")) return "kakao";
    if (host.endsWith("naver.com")) return "naver";
    return host;
  } catch { return ""; }
}

// 뽐뿌 게시글의 판매처 링크(s.ppomppu target=base64)를 해독해 실제 판매처를 확인한다.
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function readWithRetry(url, host, attempts = 4) {
  // 후보 수집 직후라 429가 잦다. 짧게 쉬고 재시도한다.
  for (let i = 0; i < attempts; i += 1) {
    try { return await readPublicSource(url, host); }
    catch (error) { if (i === attempts - 1 || !/429/.test(String(error?.message))) throw error; await sleep(4000 * (i + 1)); }
  }
  return "";
}

async function resolveMerchant(product) {
  try {
    const html = await readWithRetry(product.sourceUrl, "ppomppu.co.kr");
    const targets = [...html.matchAll(/target=([A-Za-z0-9+/=]+)/g)].map((m) => Buffer.from(m[1], "base64").toString("utf8")).filter((u) => /^https?:\/\//.test(u));
    const merchantUrl = targets[0] || "";
    const views = Number(html.match(/조회수\D{0,10}(\d+)/)?.[1]) || null;
    const recommend = Number(html.match(/<span[^>]*id=["']?rec_cnt[^>]*>(\d+)/)?.[1]) || null;
    return { merchantUrl, merchant: merchantOf(merchantUrl), views, recommend };
  } catch (error) {
    return { merchantUrl: "", merchant: "", views: null, recommend: null, error: String(error?.message || error) };
  }
}

function publishedRecords() {
  const drafts = (readJson("data/atlas/korea-drafts.json").items || []).filter((d) => d.publishedUrl || d.state === "published");
  const external = readJson("data/atlas/publisher-state.json").externalPosts || [];
  return [...drafts.map((d) => ({ name: d.productName, productUrl: d.affiliateUrl || d.productUrl, title: d.title })), ...external];
}

async function main() {
  const collected = await collectChannel("korea_naver");
  if (collected.error) throw new Error(collected.error);
  const excluded = exclusionKeys(publishedRecords());
  const top = selectTopFive(collected.candidates, excluded).filter(Boolean);

  const rows = [];
  await sleep(3000);
  for (const [index, product] of top.entries()) {
    const merchant = await resolveMerchant(product);
    await sleep(1500);
    const s = product.selection;
    rows.push({
      rank: index + 1,
      id: product.id,
      name: product.name,
      model: "",
      category: categoryOf(product.name),
      priceText: product.priceText,
      priceVerified: false,
      discountVerified: Boolean(s.discountPercent),
      discountPercent: s.discountPercent,
      popularityEvidence: product.signals?.popularity?.quote || "",
      practicalityEvidence: product.signals?.practicality?.quote || "",
      sourceUrl: product.sourceUrl,
      source: product.source,
      publishedAt: product.publishedAt,
      merchant: merchant.merchant,
      merchantUrl: merchant.merchantUrl,
      views: merchant.views,
      recommend: merchant.recommend,
      score: Number(s.score.toFixed(1)),
      components: s.components,
      badge: product.badge,
      reason: product.reason,
      monetizable: merchant.merchant === "coupang",
      merchantError: merchant.error || "",
    });
  }

  const pick = rows.find((row) => row.monetizable) || null;
  const output = {
    checkedAt: collected.checkedAt,
    weights: { popularity: 40, discount: 30, practicality: 20, trust: 10 },
    excludedPublished: publishedRecords().map((r) => r.name || r.title).filter(Boolean),
    top5: rows,
    pick: pick ? { ...pick, why: "TOP5 중 판매처가 쿠팡이라 쿠팡 파트너스 수익화가 가능한 첫 후보" } : null,
    nonMonetizable: rows.filter((r) => !r.monetizable).map((r) => `${r.rank}. ${r.name} (${r.merchant || "판매처 미확인"})`),
  };
  fs.writeFileSync(path.join(root, "data", "atlas", "korea-daily-pick.json"), `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => { console.error(String(error?.stack || error)); process.exit(1); });
