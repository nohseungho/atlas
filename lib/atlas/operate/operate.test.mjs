import assert from "node:assert/strict";
import test from "node:test";

import { ATLAS_CHANNEL_ID, validateChannelIdentity } from "../character-channel-policy.js";
import { normalizeKoreaDraft, publishBlockers, validateKoreaDraft } from "../korea-product-pipeline.js";
import { validateMasterPackage } from "../article-factory.js";
import { GLOBAL_TOPICS, KOREA_TOPICS, findTopic, koreaTopics } from "./topic-catalog.js";
import { buildKoreaInfoDraft, koreaInfoBodyText, koreaInfoImages } from "./korea-info-writer.js";
import { GLOBAL_VISUAL_COUNT, buildGlobalMasterPackage, globalDialogueMarkdown } from "./global-dialogue-writer.js";
import { duplicateReason } from "./published-index.js";

test("국내 정보글은 제휴 링크 없이도 검증을 통과한다", () => {
  const draft = normalizeKoreaDraft(buildKoreaInfoDraft(KOREA_TOPICS[0]));
  assert.equal(draft.contentType, "info_guide");
  assert.equal(draft.affiliateUrl, "");
  assert.equal(draft.affiliateDisclosure, "", "제휴 링크가 없으면 제휴 고지도 만들지 않는다");
  assert.equal(validateKoreaDraft(draft).ok, true);
});

test("국내 정보글은 연결된 이미지가 없으면 발행이 막힌다", () => {
  const draft = normalizeKoreaDraft(buildKoreaInfoDraft(KOREA_TOPICS[0]));
  assert.deepEqual(publishBlockers(draft), ["no image linked (src empty)"]);

  const withImages = normalizeKoreaDraft({
    ...draft,
    images: draft.images.map((img) => ({ ...img, src: `C:/tmp/${img.id}.png` })),
  });
  assert.deepEqual(publishBlockers(withImages), []);
});

test("국내 정보글 본문은 모든 섹션과 체크리스트, FAQ를 담는다", () => {
  const topic = KOREA_TOPICS[0];
  const body = koreaInfoBodyText(topic);
  for (const section of topic.sections) assert.ok(body.includes(section.heading), `${section.heading} 누락`);
  for (const item of topic.checklist) assert.ok(body.includes(item), `${item} 누락`);
  for (const item of topic.faq) assert.ok(body.includes(item.q), `${item.q} 누락`);
  assert.ok(body.includes("마무리"));
});

test("국내 이미지 슬롯은 수호 채널 정체성을 깨지 않는다", () => {
  const draft = normalizeKoreaDraft(buildKoreaInfoDraft(KOREA_TOPICS[1]));
  assert.equal(draft.character, "suho");
  assert.equal(validateChannelIdentity(draft, ATLAS_CHANNEL_ID.KOREA_NAVER).ok, true);
  // 정보글 슬롯은 전부 카드 문구를 갖는다(자동 생성 대상).
  for (const image of koreaInfoImages(KOREA_TOPICS[1])) assert.ok(image.card?.title);
});

test("해외 원고는 Article Factory 검증을 그대로 통과한다", () => {
  for (const topic of GLOBAL_TOPICS) {
    const master = buildGlobalMasterPackage(topic);
    const result = validateMasterPackage(master, { articles: [], mode: "production" });
    assert.equal(result.ok, true, `${topic.id}: ${result.errors.join(" / ")}`);
    assert.equal(master.visualAssets.length, GLOBAL_VISUAL_COUNT);
  }
});

test("해외 본문은 미지↔수호 문답이고 FAQ·Sources 섹션을 본문에 중복해서 쓰지 않는다", () => {
  const markdown = globalDialogueMarkdown(GLOBAL_TOPICS[0]);
  assert.ok(markdown.includes("**Miji:**"));
  assert.ok(markdown.includes("**Suho:**"));
  assert.equal(/^##\s+(FAQ|Frequently Asked Questions|Sources)\s*$/im.test(markdown), false);
});

test("해외 이미지 5장은 전부 미지이고 다른 채널 진행자를 부르지 않는다", () => {
  const master = buildGlobalMasterPackage(GLOBAL_TOPICS[0]);
  const article = { visualAssets: master.visualAssets, character: "miji", channelId: ATLAS_CHANNEL_ID.GLOBAL_BLOGGER };
  assert.equal(validateChannelIdentity(article, ATLAS_CHANNEL_ID.GLOBAL_BLOGGER).ok, true);
  const keys = master.visualAssets.map((a) => a.key);
  assert.equal(new Set(keys).size, GLOBAL_VISUAL_COUNT, "이미지 key가 중복되면 같은 그림이 두 번 렌더된다");
  // afterSection 배치는 본문에 실제로 있는 H2만 가리켜야 그림이 삽입된다.
  const headings = GLOBAL_TOPICS[0].dialogue.map((s) => s.heading);
  for (const asset of master.visualAssets) {
    if (!asset.placement.startsWith("afterSection:")) continue;
    assert.ok(headings.includes(asset.placement.slice("afterSection:".length)), `${asset.key} 배치 헤딩 없음`);
  }
});

test("이미 공개된 글과 겹치는 주제는 사유와 함께 막힌다", () => {
  const published = [{ id: "art_009", title: KOREA_TOPICS[0].title, slug: "", keyword: "", topicId: "", url: "https://example.com/a" }];
  assert.match(duplicateReason(KOREA_TOPICS[0], published), /같은 제목/);
  assert.equal(duplicateReason(KOREA_TOPICS[1], published), "");

  const byTopic = [{ id: "kr_x", title: "다른 제목", slug: "", keyword: "", topicId: KOREA_TOPICS[1].id, url: "" }];
  assert.match(duplicateReason({ ...KOREA_TOPICS[1], topicId: KOREA_TOPICS[1].id }, byTopic), /같은 주제/);
});

test("시즌 주제가 먼저 오고 모든 주제를 조회할 수 있다", () => {
  const list = koreaTopics({ month: 11 });
  assert.equal(list.length, KOREA_TOPICS.length);
  assert.equal(list[0].inSeason, true);
  assert.ok(findTopic(GLOBAL_TOPICS[0].id));
  assert.equal(findTopic("nope"), null);
});
