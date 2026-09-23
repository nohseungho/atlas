import assert from "node:assert/strict";
import test from "node:test";

import { ATLAS_CHANNEL_ID, validateChannelIdentity } from "../character-channel-policy.js";
import { canonicalNaverUrl, normalizeKoreaDraft, publishBlockers, validateKoreaDraft } from "../korea-product-pipeline.js";
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

test("국내 카드 문구는 주제마다 고유하고 본문 조각을 잘라 쓰지 않는다", () => {
  for (const topic of KOREA_TOPICS) {
    const images = koreaInfoImages(topic);
    assert.equal(images.length, 3, `${topic.id}: 카드 3장`);
    for (const image of images) {
      const card = image.card;
      assert.ok(card.title?.trim(), `${topic.id}/${image.id}: title 누락`);
      assert.ok(card.footer?.trim(), `${topic.id}/${image.id}: footer 누락`);
      assert.ok(card.columns.length >= 3, `${topic.id}/${image.id}: 칸 부족`);
      for (const [head, body] of card.columns) {
        assert.ok(head?.trim() && body?.trim(), `${topic.id}/${image.id}: 빈 칸`);
        assert.ok(body.length <= 60, `${topic.id}/${image.id}: 칸 본문이 너무 김 (${body.length}자)`);
        // 본문 문단의 앞부분을 그대로 잘라 넣으면 맥락이 끊긴 조각이 카드에 박힌다.
        // 짧은 라벨이 우연히 문단 첫 낱말과 겹치는 것은 문제가 아니므로 긴 문구만 본다.
        assert.ok(
          body.length < 20 || !topic.sections.some((sec) => sec.paragraphs.some((par) => par.startsWith(body))),
          `${topic.id}/${image.id}: 본문 문단을 잘라 쓴 문구 "${body}"`,
        );
      }
    }
    // 같은 주제 안에서 why 카드와 checklist 카드 문구가 겹치면 같은 말을 두 번 보여주게 된다.
    const whyBodies = images[0].card.columns.map(([, b]) => b);
    const listBodies = images[2].card.columns.map(([, b]) => b);
    assert.equal(whyBodies.some((b) => listBodies.includes(b)), false, `${topic.id}: why/checklist 카드 문구 중복`);
  }
  // footer가 다른 주제에서 재사용되면 추석 글에 습도 글 마무리가 붙는다.
  for (const topic of KOREA_TOPICS) {
    const others = KOREA_TOPICS.filter((t) => t.id !== topic.id);
    const mine = koreaInfoImages(topic).map((i) => i.card.footer);
    for (const other of others) {
      const theirs = koreaInfoImages(other).map((i) => i.card.footer);
      assert.equal(mine.some((f) => theirs.includes(f)), false, `${topic.id} ↔ ${other.id}: footer 재사용`);
    }
  }
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
