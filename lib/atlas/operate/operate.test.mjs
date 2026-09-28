import assert from "node:assert/strict";
import test from "node:test";

import { ATLAS_CHANNEL_ID, validateChannelIdentity } from "../character-channel-policy.js";
import { canonicalNaverUrl, normalizeKoreaDraft, publishBlockers, validateKoreaDraft } from "../korea-product-pipeline.js";
import { validateMasterPackage } from "../article-factory.js";
import { GLOBAL_TOPICS, KOREA_TOPICS, findTopic, koreaTopics } from "./topic-catalog.js";
import { buildKoreaInfoDraft, koreaInfoBodyText, koreaInfoImages } from "./korea-info-writer.js";
import { GLOBAL_VISUAL_COUNT, buildGlobalMasterPackage, globalDialogueMarkdown, globalVisualAssets } from "./global-dialogue-writer.js";
import { directionVarietyIssues } from "./scene-direction.js";
import { findSceneArt, resolveSceneArt } from "./scene-art.js";
import { buildWorkflow, generationPrompt, referenceAssets, seedFor } from "./scene-generator.js";
import { duplicateReason, uniquePublishedPosts } from "./published-index.js";
import { matchingPublicKoreaPosts } from "./naver-public-sync.js";
import { isHomeConvenienceProduct, sellerUrlFromPpomppu } from "./merchant-link.js";

test("네이버 공개 RSS에서 제목과 계정 URL이 정확히 일치할 때만 오래된 초안을 동기화한다", () => {
  const rss = `<rss><channel><item><title>환절기 집안 습도 관리</title><link>https://blog.naver.com/who-ami/224500000001</link><pubDate>Sun, 27 Sep 2026 12:00:00 GMT</pubDate></item><item><title>다른 글</title><link>https://blog.naver.com/another/224500000002</link></item></channel></rss>`;
  const drafts = [{ id: "a", topicId: "kr_info_humidity", title: "환절기 집안 습도 관리", state: "approved" },
    { id: "b", topicId: "kr_info_other", title: "다른 글", state: "approved" }];
  assert.deepEqual(matchingPublicKoreaPosts(rss, drafts).map((post) => post.id), ["a"]);
  assert.deepEqual(matchingPublicKoreaPosts(rss, [...drafts, { id: "c", topicId: "kr_info_copy", title: drafts[0].title }]), []);
});

test("오늘 상품 후보는 공개 게시글에 적힌 판매처 주소만 제작 대상으로 쓴다", () => {
  const encoded = Buffer.from("https://www.example.com/product/123").toString("base64");
  assert.equal(sellerUrlFromPpomppu(`<a href="https://s.ppomppu.co.kr/?target=${encoded}">보기</a>`),
    "https://www.example.com/product/123");
  assert.equal(sellerUrlFromPpomppu("<a href='https://s.ppomppu.co.kr/?target=%%%'>보기</a>"), "");
});

test("생활 편의 제품 후보에서 식품·차량용품·의류를 제외한다", () => {
  assert.equal(isHomeConvenienceProduct({ name: "1+1 LED 마그네틱 라이트바" }), true);
  assert.equal(isHomeConvenienceProduct({ name: "인출식 주방 수납 선반" }), true);
  assert.equal(isHomeConvenienceProduct({ name: "햅쌀 상등급 10kg" }), false);
  assert.equal(isHomeConvenienceProduct({ name: "차량용 무선 방향제" }), false);
  assert.equal(isHomeConvenienceProduct({ name: "위생장갑 20개" }), false);
});

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

test("해외 5장은 머리 모양·자세·시점·카메라 거리가 모두 다르다", () => {
  for (const topic of GLOBAL_TOPICS) {
    const items = globalVisualAssets(topic).map((a) => ({ key: a.key, direction: a.direction }));
    assert.equal(items.length, GLOBAL_VISUAL_COUNT);
    assert.deepEqual(directionVarietyIssues(items), [], `${topic.id}: ${directionVarietyIssues(items).join(" / ")}`);
  }
});

test("국내 3장은 자세·시점·카메라 거리가 서로 다르다", () => {
  for (const topic of KOREA_TOPICS) {
    const items = koreaInfoImages(topic).map((i) => ({ key: i.id, direction: i.direction }));
    assert.deepEqual(directionVarietyIssues(items), [], `${topic.id}: ${directionVarietyIssues(items).join(" / ")}`);
  }
});

test("생성 프롬프트는 얼굴을 고정하고 장면 의도를 담는다", () => {
  for (const topic of GLOBAL_TOPICS) {
    for (const asset of globalVisualAssets(topic)) {
      assert.match(asset.prompt, /Identity lock:/, `${topic.id}/${asset.key}`);
      assert.ok(asset.prompt.includes(topic.sceneIntents[asset.key]), `${topic.id}/${asset.key}: 장면 의도 누락`);
      assert.match(asset.prompt, /no text, no logo/, `${topic.id}/${asset.key}`);
    }
  }
  for (const topic of KOREA_TOPICS) {
    for (const image of koreaInfoImages(topic)) {
      assert.match(image.prompt, /Identity lock:/, `${topic.id}/${image.id}`);
      assert.ok(image.prompt.includes(topic.sceneIntents[image.role]), `${topic.id}/${image.id}: 장면 의도 누락`);
    }
  }
});

test("장면 아트가 없으면 이미지가 준비된 척하지 않는다", () => {
  // 실제로 존재하지 않는 주제 폴더. 합성으로 자리를 메우면 이 단언이 깨진다.
  const result = resolveSceneArt("global", "no-such-topic-slug", ["featured", "context"]);
  assert.equal(result.complete, false);
  assert.deepEqual(result.ready, []);
  assert.deepEqual(result.missing, ["featured", "context"]);
});

test("실제로 있는 장면 아트는 찾아낸다", () => {
  // 국내 멀티탭 세트는 저장소에 있는 실제 장면 아트다.
  assert.ok(findSceneArt("korea", "multitap", "usage"), "multitap/usage 아트를 찾지 못했습니다.");
  assert.ok(findSceneArt("korea", "multitap", "safety"), "multitap/safety 아트를 찾지 못했습니다.");
  assert.equal(findSceneArt("korea", "multitap", "nope"), null);
});

test("로컬 생성기는 채널 마스터만 얼굴 참조로 쓰고 채널을 섞지 않는다", () => {
  assert.equal(referenceAssets("global")[0], "public/atlas/characters/ATLAS-MIJI-MASTER.png");
  assert.equal(referenceAssets("korea")[0], "public/atlas/characters/ATLAS-SUO-MASTER.png");
  assert.ok(referenceAssets("global").every((p) => !/SUO|suho|korea/i.test(p)), "해외 참조에 국내 자산이 섞였습니다.");
  assert.ok(referenceAssets("korea").every((p) => !/MIJI|miji|global/i.test(p)), "국내 참조에 해외 자산이 섞였습니다.");
});

test("로컬 생성 프롬프트는 장면·연출을 유지하고 참조는 합성이 아니라 얼굴 조건으로만 들어간다", () => {
  const topic = GLOBAL_TOPICS[0];
  const assets = globalVisualAssets(topic);
  const prompts = assets.map((a) => generationPrompt("global", a.prompt, a.direction));
  for (const [i, asset] of assets.entries()) {
    assert.ok(prompts[i].includes(asset.direction.hair), `${asset.key}: 머리 모양 지시 누락`);
    assert.ok(prompts[i].includes(asset.direction.camera), `${asset.key}: 카메라 지시 누락`);
    assert.doesNotMatch(prompts[i], /Identity lock|Miji/);
  }
  assert.equal(new Set(prompts).size, prompts.length, "같은 프롬프트가 반복됩니다.");
  const seeds = assets.map((a) => seedFor("global", "t", a.key));
  assert.equal(new Set(seeds).size, seeds.length, "같은 시드가 반복됩니다.");

  const wf = buildWorkflow({ channel: "global", prompt: prompts[0], seed: seeds[0], referenceNames: ["a.png", "b.png"] });
  const nodes = Object.values(wf);
  // 참조 이미지는 IP-Adapter 입력으로만 쓰이고 합성(ImageComposite 등) 노드는 없다.
  // 미지는 검수와 같은 ArcFace 임베딩으로 얼굴을 고정한다(FaceID Plus v2).
  assert.ok(nodes.some((n) => n.class_type === "IPAdapterFaceID"));
  assert.ok(!nodes.some((n) => n.class_type === "IPAdapterAdvanced"), "해외는 Plus-Face로 되돌아가면 안 된다");
  const suho = Object.values(buildWorkflow({ channel: "korea", prompt: "x", seed: 1, referenceNames: ["a.png"] }));
  assert.ok(suho.some((n) => n.class_type === "IPAdapterAdvanced"));
  assert.ok(!nodes.some((n) => /Composite|Paste|Blend/i.test(n.class_type)));
  assert.equal(wf.latent.inputs.batch_size, 1);
  assert.equal(wf.sample.inputs.denoise, 1, "참조를 img2img로 쓰면 같은 구도가 반복된다");
});

test("해외 장면 아트는 미지 얼굴 검수 pass 기록이 없으면 준비된 것으로 보지 않는다", () => {
  // art_024 세트는 파일은 있지만 얼굴 불일치로 fail 처리됐다. 재사용되면 안 된다.
  const r = resolveSceneArt("global", "passport_validity", ["featured", "context", "comparison", "checklist", "closing"]);
  assert.deepEqual(r.ready, []);
  assert.equal(r.complete, false);
  assert.equal(r.rejected.length, 5);
  assert.ok(r.rejected.every((x) => x.faceMatch?.status === "fail"));
});

test("국내 이미지 슬롯은 수호 채널 정체성을 깨지 않는다", () => {
  const draft = normalizeKoreaDraft(buildKoreaInfoDraft(KOREA_TOPICS[1]));
  assert.equal(draft.character, "suho");
  assert.equal(validateChannelIdentity(draft, ATLAS_CHANNEL_ID.KOREA_NAVER).ok, true);
  // 정보글 슬롯은 전부 생성 프롬프트와 연출 지시를 갖는다.
  for (const image of koreaInfoImages(KOREA_TOPICS[1])) assert.ok(image.prompt && image.direction);
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

test("네이버 공개 URL이 같은 초안 기록은 실제 게시 글 한 건으로 센다", () => {
  const posts = [
    { id: "kettle", url: "https://blog.naver.com/who-ami/224418047839" },
    { id: "kettle_fix", url: "https://blog.naver.com/who-ami/224418047839/" },
    { id: "multitap", url: "https://blog.naver.com/who-ami/224412747695" },
  ];
  assert.deepEqual(uniquePublishedPosts(posts).map((post) => post.id), ["kettle", "multitap"]);
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
