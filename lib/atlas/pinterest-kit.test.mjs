import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPinterestKit, buildPinDescription, buildPinImage, derivePinTitle, deriveHook,
  parseCloudinaryUrl, pickSourceAsset, PIN_WIDTH, PIN_HEIGHT, DESCRIPTION_MIN, DESCRIPTION_MAX, PIN_TITLE_MAX,
} from "./pinterest-kit.js";

// art_013 as it stands in articles.json — the first live verification target.
function art013() {
  return {
    id: "art_013",
    title: "What Trip Cancellation Insurance Actually Covers (and What It Doesn't)",
    status: "published",
    publishedUrl: "https://atlas-money-2026.blogspot.com/2026/08/what-trip-cancellation-insurance.html",
    metaDescription:
      "Learn what trip cancellation insurance actually covers, common exclusions, airline refund rules, CFAR limits, and the documents needed for a valid claim.",
    quickAnswer:
      "Trip cancellation insurance generally reimburses eligible prepaid, non-refundable costs only when a cancellation matches a covered reason and every timing and documentation rule is satisfied.",
    visualAssets: [
      { key: "featured", publicUrl: "https://res.cloudinary.com/dmfbj4tu/image/upload/c_fill,f_webp,h_900,q_auto,w_1600/v1786626071/atlas/articles/trip-cancellation-insurance-what-it-covers/featured?_a=BAMAAAX00" },
      { key: "context", publicUrl: "https://res.cloudinary.com/dmfbj4tu/image/upload/c_fill,f_webp,h_900,q_auto,w_1600/v1786626076/atlas/articles/trip-cancellation-insurance-what-it-covers/context" },
    ],
  };
}

test("art_013 kit: hook, title, description and link", () => {
  const { ok, issues, kit } = buildPinterestKit({ article: art013() });
  assert.deepEqual(issues, []);
  assert.equal(ok, true);
  assert.equal(kit.hook, "WHAT TRIP CANCELLATION INSURANCE REALLY COVERS");
  assert.equal(kit.title, "What Trip Cancellation Insurance Actually Covers");
  assert.equal(kit.link, "https://atlas-money-2026.blogspot.com/2026/08/what-trip-cancellation-insurance.html");
  assert.ok(kit.description.length >= DESCRIPTION_MIN && kit.description.length <= DESCRIPTION_MAX, `길이 ${kit.description.length}`);
  assert.equal(kit.image.sourceAssetKey, "featured"); // the article's own hero, not another figure
});

test("pin image is exactly 2:3 and carries the hook, the source transform is dropped", () => {
  const { kit } = buildPinterestKit({ article: art013() });
  assert.equal(kit.image.width, PIN_WIDTH);
  assert.equal(kit.image.height, PIN_HEIGHT);
  assert.equal(PIN_HEIGHT / PIN_WIDTH, 1.5);
  assert.ok(kit.image.url.includes(`c_fill,g_auto,w_${PIN_WIDTH},h_${PIN_HEIGHT}`));
  assert.ok(kit.image.url.includes("WHAT%20TRIP%20CANCELLATION%20INSURANCE%20REALLY%20COVERS"));
  // the record's stored 1600x900 transform must not survive into the pin
  assert.ok(!kit.image.url.includes("h_900"));
  assert.ok(!kit.image.url.includes("?_a="));
  assert.ok(kit.image.url.endsWith("/v1786626071/atlas/articles/trip-cancellation-insurance-what-it-covers/featured.jpg"));
  // c_fit inside 800px wraps a long hook onto more lines instead of cutting it
  assert.ok(kit.image.url.includes("w_800,c_fit"));
  assert.equal(kit.image.filename, "atlas-pin-art_013.jpg");
  assert.ok(kit.image.downloadUrl.includes("fl_attachment:atlas-pin-art_013"));
});

test("overlay text never leaks a Cloudinary separator", () => {
  const img = buildPinImage({
    sourceUrl: "https://res.cloudinary.com/dm/image/upload/v1/atlas/a/featured",
    hook: "COMMAS, SLASHES / AND BACKSLASHES \\ ARE OUT",
    brandLine: "ATLAS · example.com",
    filename: "atlas-pin-art_x",
  });
  const layer = img.url.split("/").find((p) => p.startsWith("l_text:Arial_68"));
  assert.ok(!layer.slice("l_text:Arial_68_bold_center:".length).split(",")[0].includes("%2C"));
  assert.ok(!img.url.includes("SLASHES /"));
  assert.ok(img.url.includes("COMMAS%20SLASHES%20AND%20BACKSLASHES%20ARE%20OUT"));
});

test("description is built from the article's own sentences, whole sentences only", () => {
  const a = art013();
  const d = buildPinDescription(a);
  assert.ok(d.startsWith(a.quickAnswer.slice(0, 40)));
  assert.ok(d.includes("common exclusions"));
  assert.ok(d.endsWith("Read the full ATLAS guide before you book."));
  assert.ok(!/\s$/.test(d));
  // a second call is byte-identical — the same article always yields one kit
  assert.equal(d, buildPinDescription(a));
});

test("description that cannot reach the floor is reported, not padded", () => {
  const thin = { id: "art_x", title: "Short One", status: "published", publishedUrl: "https://example.com/x", metaDescription: "Too short.", visualAssets: art013().visualAssets };
  const { ok, issues } = buildPinterestKit({ article: thin });
  assert.equal(ok, false);
  assert.ok(issues.some((i) => i.includes("최소 300자")));
});

test("hook and title fall back to the article's own title", () => {
  const a = { id: "art_x", title: "How to Compare Travel Insurance Deductibles Before a Long Trip Abroad (2026 Guide)" };
  assert.equal(deriveHook(a), "HOW TO COMPARE TRAVEL INSURANCE DEDUCTIBLES");
  assert.ok(deriveHook(a).length <= 52);
  assert.ok(!/\s$/.test(deriveHook(a)));
  assert.equal(derivePinTitle(a), "How to Compare Travel Insurance Deductibles Before a Long Trip Abroad");
  assert.ok(derivePinTitle(a).length <= PIN_TITLE_MAX);
});

test("an unpublished article or a non-Cloudinary hero yields no kit", () => {
  const draft = { ...art013(), status: "written", publishedUrl: "" };
  const r1 = buildPinterestKit({ article: draft });
  assert.equal(r1.ok, false);
  assert.equal(r1.kit, null);
  assert.ok(r1.issues.some((i) => i.includes("발행")));

  const foreign = { ...art013(), visualAssets: [{ key: "featured", publicUrl: "https://example.com/hero.jpg" }] };
  const r2 = buildPinterestKit({ article: foreign });
  assert.equal(r2.ok, false);
  assert.ok(r2.issues.some((i) => i.includes("Cloudinary")));

  const noImage = { ...art013(), visualAssets: [] };
  assert.equal(buildPinterestKit({ article: noImage }).ok, false);
  assert.equal(pickSourceAsset(noImage), null);
  assert.equal(parseCloudinaryUrl("https://example.com/hero.jpg"), null);
});
