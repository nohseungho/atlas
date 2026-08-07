import test from "node:test";
import assert from "node:assert/strict";

import {
  fileBase,
  formatAmount,
  linkStatus,
  normalizeProductInput,
  parseAmount,
  parseProductJson,
  resolveDiscount,
  safeSlug,
} from "./product-model.js";
import { buildCaptionText, buildCards, buildPackageJson, applyOverrides, josa } from "./copy-engine.js";
import { fitText, tokenize, wrapText } from "./text-layout.js";
import { contrastRatio, pickInk, scrimAlphaFor } from "./color.js";
import { buildZip, crc32, readPngSize, toBytes } from "./zip.js";
import { computeImageDraw } from "./renderer.js";
import { CARD_HEIGHT, CARD_WIDTH, getPreset, PRESETS } from "./presets.js";

const baseProduct = {
  name: "휴대용 미니 가습기",
  category: "생활가전",
  vendor: "쿠팡",
  currentPrice: "12,900원",
  shippingFee: "0",
  productUrl: "https://example.com/item/1",
  benefit: "건조한 사무실 책상 위 습도 관리",
  features: ["USB-C 직결", "500ml 대용량", "야간 무드등"],
  audience: "사무실에서 오래 앉아 일하는 사람",
  priceSource: "판매처 상품 페이지",
  priceCheckedAt: "2026-08-05T09:00:00.000Z",
  hashtags: "#가습기 #사무실템",
  imageSource: "판매처 제공 이미지",
  imageRightsConfirmed: true,
};

// ── 상품 정규화 ────────────────────────────────────────────────────────────

test("금액 파싱: 콤마·원 표기를 받아들이고, 없으면 null(미확인)로 둔다", () => {
  assert.equal(parseAmount("12,900원"), 12900);
  assert.equal(parseAmount(12900), 12900);
  assert.equal(parseAmount(""), null);
  assert.equal(parseAmount("가격문의"), null);
  assert.equal(parseAmount(null), null);
  assert.equal(parseAmount("0"), 0);
});

test("상품명이 없으면 저장을 거부한다", () => {
  const result = normalizeProductInput({ category: "생활가전" });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("상품명")));
});

test("정상가가 미확인이면 할인율을 만들어내지 않는다", () => {
  const { product } = normalizeProductInput(baseProduct);
  assert.equal(product.listPrice, null);
  assert.equal(product.discountPercent, null);
  assert.equal(resolveDiscount({ currentPrice: 12900, listPrice: null }).percent, null);
});

test("정상가·현재가가 모두 확인된 경우에만 할인율을 계산한다", () => {
  const { product } = normalizeProductInput({ ...baseProduct, listPrice: "19,900" });
  assert.equal(product.listPrice, 19900);
  assert.equal(product.discountPercent, 35);
  // 정상가가 더 싸면 할인율을 만들지 않는다
  assert.equal(resolveDiscount({ currentPrice: 20000, listPrice: 19900 }).percent, null);
});

test("http/https가 아닌 URL은 거부한다", () => {
  const result = normalizeProductInput({ ...baseProduct, productUrl: "javascript:alert(1)" });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("http")));
});

test("가격 근거·이미지 사용 확인이 없으면 경고를 남긴다(저장은 허용)", () => {
  const result = normalizeProductInput({
    name: "테스트 상품",
    currentPrice: "1000",
  });
  assert.equal(result.ok, true);
  assert.ok(result.warnings.some((w) => w.includes("가격 확인 시각")));
  assert.ok(result.warnings.some((w) => w.includes("이미지 사용 확인")));
});

test("JSON 붙여넣기는 폼 입력과 같은 결과를 만든다", () => {
  const parsed = parseProductJson(JSON.stringify(baseProduct));
  assert.equal(parsed.ok, true);
  const fromJson = normalizeProductInput(parsed.value).product;
  const fromForm = normalizeProductInput(baseProduct).product;
  assert.equal(fromJson.name, fromForm.name);
  assert.equal(fromJson.currentPrice, fromForm.currentPrice);
  assert.deepEqual(fromJson.features, fromForm.features);
});

test("깨진 JSON은 이유와 함께 거부한다", () => {
  const parsed = parseProductJson("{name: ");
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /JSON/);
});

test("제휴 링크·상품태그가 없으면 판매 연결 전 상태다", () => {
  assert.equal(linkStatus({ affiliateLink: "[Affiliate Link Placeholder]" }), "UNLINKED");
  assert.equal(linkStatus({ affiliateLink: "" }), "UNLINKED");
  assert.equal(linkStatus({ affiliateLink: "https://link.example/abc" }), "LINKED");
  assert.equal(linkStatus({ tagNote: "인스타 상품 태그 연결됨" }), "LINKED");
});

// ── 파일명 ────────────────────────────────────────────────────────────────

test("파일명에 경로 구분자·금지문자가 들어가지 않는다", () => {
  const name = fileBase({
    productName: 'a/b\\c:d*e?f"g<h>i|j 미니 가습기',
    platform: "instagram",
    date: new Date("2026-08-05T00:00:00"),
  });
  assert.equal(/[<>:"/\\|?*]/.test(name), false);
  assert.match(name, /^atlas_.+_instagram_20260805$/);
  assert.match(name, /미니-가습기/);
});

test("빈 상품명·예약어는 안전한 기본값으로 바꾼다", () => {
  assert.equal(safeSlug(""), "product");
  assert.equal(safeSlug("CON"), "product");
});

// ── 문구 엔진 ──────────────────────────────────────────────────────────────

test("상품 1개에서 6장이 순서대로 생성된다", () => {
  const { product } = normalizeProductInput(baseProduct);
  const cards = buildCards(product);
  assert.equal(cards.length, 6);
  assert.deepEqual(
    cards.map((c) => c.slug),
    ["01-cover", "02-problem", "03-features", "04-price", "05-audience", "06-cta"],
  );
  assert.ok(cards.every((c) => c.headline));
});

test("가격 카드는 최저가가 아니라 현재 확인가로 표기하고 근거를 붙인다", () => {
  const { product } = normalizeProductInput(baseProduct);
  const price = buildCards(product).find((c) => c.kind === "price");
  assert.match(price.headline, /현재 확인가/);
  assert.equal(/최저가/.test(JSON.stringify(price)), false);
  assert.match(price.footnote, /출처 판매처 상품 페이지/);
  assert.ok(price.bullets.some((b) => b.includes("정상가 미확인")));
});

test("연결 전 상품은 수수료가 발생하는 것처럼 쓰지 않는다", () => {
  const { product } = normalizeProductInput(baseProduct);
  const cta = buildCards(product).find((c) => c.kind === "cta");
  assert.equal(cta.badge, "판매 연결 전");
  assert.match(cta.footnote, /제휴 수수료가 발생하지 않습니다/);

  const linked = normalizeProductInput({ ...baseProduct, affiliateLink: "https://link.example/x" }).product;
  const linkedCta = buildCards(linked).find((c) => c.kind === "cta");
  assert.equal(linkedCta.badge, "판매 연결됨");
  assert.match(linkedCta.footnote, /수수료를 받을 수 있습니다/);
});

test("한국어 조사는 받침에 맞춰 붙는다", () => {
  assert.equal(josa("가습기", "이가"), "가");
  assert.equal(josa("책상", "이가"), "이");
  assert.equal(josa("사람", "이라면"), "이라면");
  assert.equal(josa("의자", "이라면"), "라면");
  assert.equal(josa("서울", "으로"), "로");
  assert.equal(josa("부산", "으로"), "으로");
});

test("카드 문구는 카드별로 덮어쓸 수 있다", () => {
  const { product } = normalizeProductInput(baseProduct);
  const cards = applyOverrides(buildCards(product), {
    "01-cover": { headline: "직접 고친 표지 문구", bulletsText: "첫 줄\n둘째 줄" },
  });
  assert.equal(cards[0].headline, "직접 고친 표지 문구");
  assert.deepEqual(cards[0].bullets, ["첫 줄", "둘째 줄"]);
  assert.notEqual(cards[1].headline, "직접 고친 표지 문구");
});

test("게시 패키지 텍스트/JSON에 상품정보·해시태그·고지가 모두 들어간다", () => {
  const { product } = normalizeProductInput(baseProduct);
  const cards = buildCards(product);
  const text = buildCaptionText(product, cards, { platform: "instagram" });
  assert.match(text, /#가습기/);
  assert.match(text, /현재 확인가 12,900원/);
  assert.match(text, /판매 연결 전/);
  assert.match(text, /https:\/\/example.com\/item\/1/);

  const json = buildPackageJson(product, cards, { platform: "instagram", preset: "clean" });
  assert.equal(json.cards.length, 6);
  assert.equal(json.linkStatus, "UNLINKED");
  assert.equal(json.product.currentPrice, 12900);
});

test("금액 표기는 통화에 맞춘다", () => {
  assert.equal(formatAmount(12900, "KRW"), "12,900원");
  assert.equal(formatAmount(19.99, "USD"), "$19.99");
  assert.equal(formatAmount(null, "KRW"), "미확인");
});

// ── 줄바꿈 ────────────────────────────────────────────────────────────────

// 한글 1글자 = 20px, 그 외 1글자 = 10px로 가정한 가짜 measure
const CJK = /[가-힣ㄱ-ㅎㅏ-ㅣ]/;
const fakeMeasure = (scale = 1) => (text) =>
  [...String(text)].reduce((sum, ch) => sum + (CJK.test(ch) ? 20 : 10), 0) * scale;

test("한글은 글자 단위로, 영문은 단어 단위로 줄바꿈한다", () => {
  const lines = wrapText("건조한 사무실 책상 위 습도 관리", 120, fakeMeasure());
  assert.ok(lines.length > 1);
  assert.ok(lines.every((line) => fakeMeasure()(line) <= 120));

  const en = wrapText("portable mini humidifier device", 120, fakeMeasure());
  assert.ok(en.every((line) => !/^[a-z]+$/.test(line) || line.length > 2));
  assert.ok(en.every((line) => fakeMeasure()(line) <= 120));
});

test("줄 첫머리에 문장부호가 오지 않는다(금칙 처리)", () => {
  const lines = wrapText("가격은 12,900원 입니다.", 100, fakeMeasure());
  assert.ok(lines.every((line) => !/^[.,!?%)\]}」』]/.test(line)));
});

test("강제 개행(\\n)은 그대로 유지한다", () => {
  const lines = wrapText("첫 줄\n둘째 줄", 1000, fakeMeasure());
  assert.deepEqual(lines, ["첫 줄", "둘째 줄"]);
});

test("토크나이저는 한글을 글자 단위로 자른다", () => {
  assert.deepEqual(tokenize("가나 ab"), ["가", "나", " ", "ab"]);
});

test("긴 문구는 폰트를 줄여 안전영역 안에 넣고, 그래도 넘치면 말줄임한다", () => {
  const measureFactory = (size) => (text) => fakeMeasure(size / 40)(text);
  const short = fitText("짧은 문구", {
    maxWidth: 600,
    maxLines: 2,
    maxFontSize: 80,
    minFontSize: 30,
    measureFactory,
  });
  assert.equal(short.overflow, false);
  assert.ok(short.lines.length <= 2);

  const long = fitText("아주 긴 문구를 넣어서 카드 밖으로 절대 넘치지 않는지 확인한다".repeat(4), {
    maxWidth: 300,
    maxLines: 2,
    maxFontSize: 80,
    minFontSize: 30,
    measureFactory,
  });
  assert.equal(long.overflow, true);
  assert.ok(long.lines.length <= 2);
  assert.ok(long.lines.some((line) => line.endsWith("…")));
});

// ── 대비 ──────────────────────────────────────────────────────────────────

test("프리셋의 본문 대비가 WCAG AA(4.5:1)를 넘는다", () => {
  for (const preset of PRESETS) {
    if (preset.structure === "image-top-panel-bottom") {
      assert.ok(contrastRatio(preset.palette.panel, preset.palette.ink) >= 4.5, preset.id);
      assert.ok(contrastRatio(preset.palette.panel, preset.palette.muted) >= 4.5, `${preset.id} muted`);
    }
    if (preset.structure === "band-top-image-mid-dark-bottom") {
      assert.ok(contrastRatio(preset.palette.accent, preset.palette.accentInk) >= 4.5, preset.id);
      assert.ok(contrastRatio(preset.palette.panel, preset.palette.ink) >= 4.5, `${preset.id} body`);
    }
    if (preset.structure === "full-bleed-overlay") {
      // 스크림이 덮인 뒤의 배경(#080a0c)과 잉크 대비
      assert.ok(contrastRatio("#080a0c", preset.palette.ink) >= 4.5, preset.id);
      assert.ok(contrastRatio("#080a0c", preset.palette.muted) >= 4.5, `${preset.id} muted`);
    }
  }
});

test("이미지 위 텍스트에 필요한 스크림 농도를 계산한다", () => {
  const alpha = scrimAlphaFor("#ffffff", { minRatio: 4.5 });
  assert.ok(alpha > 0.4 && alpha <= 1);
  assert.equal(pickInk("#ffffff"), "#111111");
  assert.equal(pickInk("#101215"), "#ffffff");
});

// ── 프리셋 구조 ────────────────────────────────────────────────────────────

test("프리셋 3개는 색만 다른 동일 레이아웃이 아니다", () => {
  assert.equal(PRESETS.length, 3);
  const structures = new Set(PRESETS.map((p) => p.structure));
  assert.equal(structures.size, 3);

  const clean = getPreset("clean");
  const deal = getPreset("deal");
  const lifestyle = getPreset("lifestyle");

  // 이미지 박스 위치·크기가 서로 다르다
  assert.notDeepEqual(clean.imageBox, deal.imageBox);
  assert.notDeepEqual(deal.imageBox, lifestyle.imageBox);
  // 텍스트 존 시작 y가 서로 다르다
  const ys = new Set([clean.textBox.y, deal.textBox.y, lifestyle.textBox.y]);
  assert.equal(ys.size, 3);
  // 정렬/기본 fit도 다르다
  assert.equal(deal.align, "center");
  assert.equal(clean.align, "left");
  assert.equal(lifestyle.defaultFit, "cover");
  // Lifestyle만 이미지가 전면을 덮는다
  assert.equal(lifestyle.imageBox.h, CARD_HEIGHT);
  assert.ok(clean.imageBox.h < CARD_HEIGHT);
  assert.ok(deal.imageBox.w < CARD_WIDTH);
});

test("모든 텍스트 존이 안전영역(84px) 안에 있다", () => {
  for (const preset of PRESETS) {
    assert.ok(preset.textBox.x >= 84, preset.id);
    assert.ok(preset.textBox.x + preset.textBox.w <= CARD_WIDTH - 84, preset.id);
    assert.ok(preset.textBox.y + preset.textBox.h <= CARD_HEIGHT, preset.id);
  }
});

// ── 이미지 배치 ────────────────────────────────────────────────────────────

const box = { x: 0, y: 0, w: 1080, h: 1150 };

test("contain은 비율을 유지하고 어떤 원본에서도 잘리지 않는다", () => {
  for (const [w, h] of [
    [2000, 1000], // 가로형
    [800, 1600], // 세로형
    [1200, 1200], // 정사각형
    [640, 480],
  ]) {
    const draw = computeImageDraw(w, h, box, { fit: "contain", scale: 1 });
    assert.ok(Math.abs(draw.aspectRatio - 1) < 1e-9, `${w}x${h} 비율 왜곡`);
    assert.ok(draw.dw <= box.w + 0.001 && draw.dh <= box.h + 0.001, `${w}x${h} 잘림`);
    assert.ok(draw.dx >= box.x - 0.001 && draw.dy >= box.y - 0.001);
  }
});

test("cover는 비율을 유지한 채 박스를 가득 채운다", () => {
  const draw = computeImageDraw(2000, 1000, box, { fit: "cover", scale: 1 });
  assert.ok(Math.abs(draw.aspectRatio - 1) < 1e-9);
  assert.ok(draw.dw >= box.w - 0.001 && draw.dh >= box.h - 0.001);
});

test("확대 배율과 초점 위치가 배치에 반영된다", () => {
  const base = computeImageDraw(1200, 1200, box, { fit: "contain", scale: 1 });
  const zoomed = computeImageDraw(1200, 1200, box, { fit: "contain", scale: 1.5 });
  assert.ok(zoomed.dw > base.dw);
  assert.ok(Math.abs(zoomed.aspectRatio - 1) < 1e-9);

  const left = computeImageDraw(800, 1600, box, { fit: "contain", focusX: 0 });
  const right = computeImageDraw(800, 1600, box, { fit: "contain", focusX: 1 });
  assert.equal(left.dx, box.x);
  assert.ok(right.dx > left.dx);
});

test("작은 원본은 확대 배율로 화질 경고를 판단할 수 있다", () => {
  const small = computeImageDraw(300, 300, box, { fit: "contain", scale: 1 });
  assert.ok(small.upscale > 1.15);
  const large = computeImageDraw(3000, 3000, box, { fit: "contain", scale: 1 });
  assert.ok(large.upscale < 1);
});

// ── ZIP ───────────────────────────────────────────────────────────────────

test("ZIP 구조: 시그니처·엔트리 수·CRC가 규격에 맞는다", () => {
  const files = [
    { name: "01-cover.png", data: new Uint8Array([1, 2, 3, 4]) },
    { name: "caption.txt", data: "안녕하세요" },
  ];
  const zip = buildZip(files, { date: new Date("2026-08-05T10:00:00") });
  const view = new DataView(zip.buffer);

  assert.equal(view.getUint32(0, true), 0x04034b50); // local file header
  const eocd = zip.length - 22;
  assert.equal(view.getUint32(eocd, true), 0x06054b50);
  assert.equal(view.getUint16(eocd + 8, true), 2); // 이 디스크의 엔트리 수
  assert.equal(view.getUint16(eocd + 10, true), 2); // 전체 엔트리 수

  const centralOffset = view.getUint32(eocd + 16, true);
  assert.equal(view.getUint32(centralOffset, true), 0x02014b50);
  assert.equal(view.getUint32(14, true), crc32(new Uint8Array([1, 2, 3, 4])));

  // UTF-8 파일명 플래그
  assert.equal(view.getUint16(6, true), 0x0800);
  const nameLength = view.getUint16(26, true);
  assert.equal(new TextDecoder().decode(zip.slice(30, 30 + nameLength)), "01-cover.png");
});

test("CRC32는 알려진 값과 일치한다", () => {
  assert.equal(crc32(toBytes("123456789")), 0xcbf43926);
});

test("PNG 헤더에서 실제 크기를 읽는다(다운로드 결과 검증용)", () => {
  const png = new Uint8Array(24);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(png.buffer);
  view.setUint32(16, 1080);
  view.setUint32(20, 1920);
  assert.deepEqual(readPngSize(png), { width: 1080, height: 1920 });
  assert.equal(readPngSize(new Uint8Array([1, 2, 3])), null);
});
