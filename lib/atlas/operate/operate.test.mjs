import assert from "node:assert/strict";
import test from "node:test";

import { ATLAS_CHANNEL_ID, validateChannelIdentity } from "../character-channel-policy.js";
import { canonicalNaverUrl, normalizeKoreaDraft, publishBlockers, validateKoreaDraft } from "../korea-product-pipeline.js";
import { validateMasterPackage } from "../article-factory.js";
import { GLOBAL_TOPICS, KOREA_TOPICS, findTopic, koreaTopics } from "./topic-catalog.js";
import { buildKoreaInfoDraft, koreaInfoBodyText, koreaInfoImages } from "./korea-info-writer.js";
import { GLOBAL_VISUAL_COUNT, buildGlobalMasterPackage, globalDialogueMarkdown, globalVisualAssets } from "./global-dialogue-writer.js";
import { MAX_LABEL_CHARS, compositionFor, compositionVarietyIssues, sceneImageIssues } from "./scene-composition.js";
import { TOPIC_SCENES, scenesForTopic } from "./scene-library.js";
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

test("장면이 선언된 주제는 역할마다 다른 사진과 다른 구도를 쓴다", () => {
  const cases = [
    ...KOREA_TOPICS.filter((t) => scenesForTopic(t.id)).map((t) => ["korea", t, koreaInfoImages({ ...t, scenes: scenesForTopic(t.id) })]),
    ...GLOBAL_TOPICS.filter((t) => scenesForTopic(t.id)).map((t) => ["global", t, globalVisualAssets({ ...t, scenes: scenesForTopic(t.id) })]),
  ];
  assert.ok(cases.length >= 2, "장면이 선언된 주제가 국내·해외 모두 있어야 한다");

  for (const [channel, topic, images] of cases) {
    const items = images.map((img) => ({
      key: img.key || img.id,
      scene: img.scene,
      card: img.card,
      composition: compositionFor(channel, img.role),
    }));
    assert.deepEqual(sceneImageIssues(items), [], `${topic.id}: ${sceneImageIssues(items).join(" / ")}`);
  }
});

test("카드형 이미지 문구는 더 이상 만들어지지 않는다", () => {
  for (const topic of KOREA_TOPICS) {
    for (const image of koreaInfoImages({ ...topic, scenes: scenesForTopic(topic.id) })) {
      assert.equal(image.card, undefined, `${topic.id}/${image.id}: 카드 문구가 남아 있습니다.`);
    }
  }
  for (const topic of GLOBAL_TOPICS) {
    for (const asset of globalVisualAssets({ ...topic, scenes: scenesForTopic(topic.id) })) {
      assert.equal(asset.card, undefined, `${topic.id}/${asset.key}: 카드 문구가 남아 있습니다.`);
    }
  }
});

test("이미지 라벨은 한 줄 짧은 문구이고 문장·목록을 담지 않는다", () => {
  for (const topicId of Object.keys(TOPIC_SCENES)) {
    for (const [role, scene] of Object.entries(TOPIC_SCENES[topicId])) {
      assert.ok(scene.file.startsWith("File:"), `${topicId}/${role}: Commons 파일명이 아닙니다.`);
      assert.ok(scene.label.length <= MAX_LABEL_CHARS, `${topicId}/${role}: 라벨 ${scene.label.length}자`);
      assert.equal(/[.!?]\s/.test(scene.label), false, `${topicId}/${role}: 라벨에 문장이 들어갔습니다.`);
    }
  }
});

test("역할별 구도는 서로 겹치지 않는다", () => {
  for (const [channel, roles] of [
    ["korea", ["info_why", "info_how", "info_checklist"]],
    ["global", ["featured", "context", "comparison", "checklist", "closing"]],
  ]) {
    const items = roles.map((role) => ({ key: role, composition: compositionFor(channel, role) }));
    assert.deepEqual(compositionVarietyIssues(items), [], `${channel}: 구도 중복`);
  }
});

test("국내 이미지 슬롯은 수호 채널 정체성을 깨지 않는다", () => {
  const draft = normalizeKoreaDraft(buildKoreaInfoDraft(KOREA_TOPICS[1]));
  assert.equal(draft.character, "suho");
  assert.equal(validateChannelIdentity(draft, ATLAS_CHANNEL_ID.KOREA_NAVER).ok, true);
  // 정보글 슬롯은 전부 장면 선언을 갖는다(자동 생성 대상).
  for (const image of koreaInfoImages({ ...KOREA_TOPICS[1], scenes: scenesForTopic(KOREA_TOPICS[1].id) })) assert.ok(image.scene?.file);
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

test("네이버 발행 직후의 긴 주소는 정식 퍼머링크로 정규화된다", () => {
  assert.equal(
    canonicalNaverUrl("https://blog.naver.com/PostView.naver?blogId=who-ami&Redirect=View&logNo=224420731235&categoryNo=1&isAfterWrite=true", "who-ami"),
    "https://blog.naver.com/who-ami/224420731235",
  );
  // 이미 정식 주소면 그대로 둔다.
  assert.equal(canonicalNaverUrl("https://blog.naver.com/who-ami/224418550466"), "https://blog.naver.com/who-ami/224418550466");
  // 네이버가 아닌 주소나 빈 값은 건드리지 않는다.
  assert.equal(canonicalNaverUrl("https://example.com/x", "who-ami"), "https://example.com/x");
  assert.equal(canonicalNaverUrl("", "who-ami"), "");
});
