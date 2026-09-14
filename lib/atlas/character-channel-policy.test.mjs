import test from "node:test";
import assert from "node:assert/strict";
import {
  ATLAS_CHANNEL_ID,
  bindVisualAssetsToChannel,
  stampChannelIdentity,
  validateChannelIdentity,
  validateNaverWriteTarget,
} from "./character-channel-policy.js";

test("global Blogger always stamps Miji and its own asset namespace", () => {
  const article = stampChannelIdentity({ language: "en" }, ATLAS_CHANNEL_ID.GLOBAL_BLOGGER);
  assert.equal(article.heroCharacterId, "miji");
  assert.equal(article.masterAssetPath, "public/atlas/characters/ATLAS-MIJI-MASTER.png");
  assert.equal(article.assetScope, "global");
});

test("Korea Naver always stamps Suho and who-ami", () => {
  const draft = stampChannelIdentity({ character: "miji", blogId: "wrong" }, ATLAS_CHANNEL_ID.KOREA_NAVER);
  assert.equal(draft.character, "suho");
  assert.equal(draft.blogId, "who-ami");
  assert.equal(draft.assetScope, "korea");
});

test("global people scenes require the Miji master identity reference", () => {
  const [asset] = bindVisualAssetsToChannel([{ key: "featured", prompt: "A traveler planning a trip" }], ATLAS_CHANNEL_ID.GLOBAL_BLOGGER);
  assert.equal(asset.characterId, "miji");
  assert.equal(asset.characterRequired, true);
  assert.match(asset.prompt, /Identity lock:/);
  assert.match(asset.prompt, /Do not substitute another presenter/);
});

test("domestic and global asset namespaces cannot be mixed", () => {
  const korea = validateChannelIdentity({ images: [{ src: "https://res.cloudinary.com/x/atlas/articles/a/b" }] }, ATLAS_CHANNEL_ID.KOREA_NAVER);
  const global = validateChannelIdentity({ visualAssets: [{ localSrc: ".atlas-data/korea-assets/a.png" }] }, ATLAS_CHANNEL_ID.GLOBAL_BLOGGER);
  assert.equal(korea.ok, false);
  assert.equal(global.ok, false);
});

test("protected Naver post can never be edited", () => {
  const result = validateNaverWriteTarget({ contentType: "existing_post_update", logNo: "224407589323" });
  assert.equal(result.ok, false);
  assert.match(result.issues.join(" "), /immutable/);
});

test("new who-ami post is allowed only without a logNo", () => {
  assert.equal(validateNaverWriteTarget({ contentType: "new_product_review", logNo: "" }).ok, true);
  assert.equal(validateNaverWriteTarget({ contentType: "new_product_review", logNo: "123" }).ok, false);
});
