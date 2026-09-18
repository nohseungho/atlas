import test from "node:test";
import assert from "node:assert/strict";
import {
  applyImagePlacements,
  bodyHtmlFromDraft,
  bodyParagraphsFromDraft,
  bodyPlainTextFromDraft,
  pickAnchorParagraphIndex,
  planImagePlacements,
  usableImages,
} from "./naver-image-placement.js";

const DISCLOSURE = "이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받을 수 있습니다.";

const multitapDraft = {
  title: "멀티탭, 아무거나 쓰면 안 되는 이유와 안전하게 고르는 법",
  productName: "에코파워탭 국내 제조 순동 일체형 개별 스위치 과부하 차단 멀티탭 4구 CSG-40415 1.5m",
  affiliateUrl: "https://link.coupang.com/a/gXAFcqeHYa",
  affiliateDisclosure: DISCLOSURE,
  bodyText: [
    "집에서 멀티탭을 바꾸게 되는 계기는 대부분 비슷합니다.\nTV 뒤에 꽂아둔 멀티탭이 어느 날 만져보니 미지근하게 뜨겁거나,",
    "오늘 소개할 제품",
    "에코파워탭 국내 제조 순동 일체형 개별 스위치 과부하 차단 멀티탭 4구 CSG-40415 1.5m입니다.\n이름이 길지만 제품의 핵심이 그대로 들어 있습니다.\n국내 제조, 순동 일체형 단자, 콘센트별 개별 스위치, 과부하 차단, 4구, 1.5m 케이블 구성입니다.",
    "아쉬운 점",
    "4구 구성이라 연결할 기기가 많은 자리에는 부족할 수 있습니다.",
    "제품 정보는 아래에서 확인할 수 있습니다.\n가격과 옵션은 판매 페이지 기준으로 한 번 더 확인해 주세요.",
    "마무리",
    "멀티탭은 한 번 사면 몇 년을 쓰는 물건입니다.",
  ].join("\n\n"),
  images: [
    { id: "img_product_photo_1", role: "product_photo", src: "", anchorKeywords: ["이름이 길지만"] },
    { id: "img_usage", role: "body_usage", src: "public/atlas/korea/suho/multitap/featured.png", anchorKeywords: ["개별 스위치", "콘센트별"] },
    { id: "img_safety", role: "body_safety", src: "public/atlas/korea/suho/multitap/safety.png", anchorKeywords: ["존재하지 않는 키워드"] },
    { id: "img_remote", role: "product_photo", src: "https://example.com/x.png", anchorKeywords: ["마무리"] },
  ],
};

const existsAll = () => true;

test("usableImages skips empty src, remote URLs, and missing files", () => {
  const list = usableImages(multitapDraft.images, existsAll);
  assert.deepEqual(list.map((i) => i.id), ["img_usage", "img_safety"]);
  const none = usableImages(multitapDraft.images, () => false);
  assert.equal(none.length, 0);
});

test("anchor lookup matches the whole paragraph containing the keyword, never a substring position", () => {
  const paragraphs = bodyParagraphsFromDraft(multitapDraft);
  const index = pickAnchorParagraphIndex(paragraphs, ["개별 스위치", "콘센트별"]);
  assert.equal(index, 2);
  assert.ok(paragraphs[index].includes("콘센트별 개별 스위치"));
  assert.equal(pickAnchorParagraphIndex(paragraphs, ["존재하지 않는 키워드"]), -1);
  assert.equal(pickAnchorParagraphIndex(paragraphs, []), -1);
});

test("images are only inserted after whole paragraphs and never split words like 개별", () => {
  const paragraphs = bodyParagraphsFromDraft(multitapDraft);
  const placements = planImagePlacements(paragraphs, multitapDraft.images, existsAll);
  const rendered = applyImagePlacements(paragraphs, placements);

  const texts = rendered.filter((n) => n.type === "text").map((n) => n.text);
  assert.deepEqual(texts, paragraphs, "paragraph texts must be byte-identical after insertion");

  const flat = rendered.map((n) => (n.type === "image" ? `[IMG:${n.id}]` : n.text)).join("\n");
  assert.ok(!flat.includes("개[IMG"), "keyword must not be split by an image");
  assert.ok(flat.includes("콘센트별 개별 스위치, 과부하 차단, 4구, 1.5m 케이블 구성입니다.\n[IMG:img_usage]"));

  // image markers only ever sit between text nodes, never inside one
  for (const node of rendered) if (node.type === "text") assert.ok(!node.text.includes("[IMG"));
});

test("unmatched anchor falls back to the end of the last paragraph without touching body text", () => {
  const paragraphs = bodyParagraphsFromDraft(multitapDraft);
  const placements = planImagePlacements(paragraphs, multitapDraft.images, existsAll);
  const safety = placements.find((p) => p.id === "img_safety");
  assert.equal(safety.matched, false);
  assert.equal(safety.skipped, false);
  assert.equal(safety.paragraphIndex, paragraphs.length - 1);
  const rendered = applyImagePlacements(paragraphs, placements);
  assert.equal(rendered.at(-1).type, "image");
  assert.equal(rendered.at(-1).id, "img_safety");
  assert.deepEqual(rendered.filter((n) => n.type === "text").map((n) => n.text), paragraphs);
});

test("image is skipped when there is no paragraph to anchor to", () => {
  const placements = planImagePlacements([], multitapDraft.images, existsAll);
  assert.ok(placements.every((p) => p.skipped));
  assert.deepEqual(applyImagePlacements([], placements), []);
});

test("affiliate disclosure renders exactly once at the bottom, after the product link", () => {
  const html = bodyHtmlFromDraft(multitapDraft);
  const disclosureCount = html.split(DISCLOSURE).length - 1;
  assert.equal(disclosureCount, 1);
  const disclosureAt = html.indexOf(DISCLOSURE);
  assert.ok(disclosureAt > html.lastIndexOf("마무리"));
  assert.ok(disclosureAt > html.indexOf("<a href"));
  assert.ok(html.trimEnd().endsWith("</p>"));
  assert.equal((html.match(/<a href/g) || []).length, 1);
  assert.ok(html.indexOf("<a href") > html.indexOf("아래에서 확인"));

  const plain = bodyPlainTextFromDraft(multitapDraft);
  assert.ok(plain.trimEnd().endsWith(DISCLOSURE));
  assert.equal(plain.split(DISCLOSURE).length - 1, 1);
});

test("no affiliate url means no disclosure and no link", () => {
  const html = bodyHtmlFromDraft({ ...multitapDraft, affiliateUrl: "" });
  assert.ok(!html.includes(DISCLOSURE));
  assert.ok(!html.includes("<a href"));
});

test("rendered html keeps every body line verbatim and headings at 19px bold centered", () => {
  const html = bodyHtmlFromDraft(multitapDraft);
  const textOnly = html
    .replace(/<p><br><\/p>/g, "\n")
    .replace(/<br>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  for (const line of multitapDraft.bodyText.split("\n").map((l) => l.trim()).filter(Boolean)) {
    assert.ok(textOnly.includes(line), `missing line: ${line}`);
  }
  for (const heading of ["오늘 소개할 제품", "아쉬운 점", "마무리"]) {
    assert.ok(html.includes(`<b><span style="font-size:19px;">${heading}</span></b>`));
  }
  assert.ok(!/<p style="(?!text-align:center;)/.test(html.replace(/<p><br><\/p>/g, "")));
});
