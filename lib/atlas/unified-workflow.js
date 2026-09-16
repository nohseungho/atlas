import { prepareProduct, shortsMaterial, publishedUrlFor, assertIdentity } from "./unified-products.js";
import { identityKeys, exclusionKeys, isExcluded, selectTopFive } from "./unified-selection.js";

const UNCERTAIN = new Set(["publishing", "needs_reconciliation"]);
export function publishedExclusions(state, external = []) {
  const attempted = Object.values(state.drafts || {}).filter((d) => d.publishedUrl || d.state === "published" || UNCERTAIN.has(d.state));
  const results = Object.values(state.results || {}).flatMap((group) => Object.values(group));
  const remote = Object.values(state.publications || {}).flat();
  return exclusionKeys([...external, ...attempted, ...results, ...remote]);
}
export function applyCollected(state, collected, external = []) {
  const seen = publishedExclusions(state, external);
  for (const [channel, result] of Object.entries(collected)) {
    state.channels[channel] = { ...result, slots: selectTopFive(result.candidates || [], seen) };
    for (const product of state.channels[channel].slots.filter(Boolean)) identityKeys(product).forEach((key) => seen.add(key));
  }
}
export function prepareMaterial(state, id, target, external = []) {
  if (!["blog", "shorts"].includes(target)) throw new Error("준비할 자료를 선택하세요.");
  const product = Object.values(state.channels).flatMap((c) => c.slots).find((p) => p?.id === id);
  if (!product || isExcluded(product, publishedExclusions(state, external))) throw new Error("이미 발행했거나 확인이 필요한 제품입니다. 자료를 업데이트하세요.");
  if (Date.now() - Date.parse(product.checkedAt) > 86400000) throw new Error("오늘 자료 업데이트가 필요합니다.");
  let draft = state.drafts[id];
  if (draft && draft.product.checkedAt !== product.checkedAt) {
    // A new evidence snapshot gets a new preparation revision; keep every edited predecessor.
    state.archives ||= {};
    state.archives[id] ||= [];
    state.archives[id].push(structuredClone(draft));
    draft = null;
  }
  if (!draft) draft = state.drafts[id] = prepareProduct(product, { includeShorts: false });
  assertIdentity(draft);
  if (!draft.images?.length) draft.images = prepareProduct(draft.product, { includeShorts: false }).images;
  // Retry prepares only the missing material. Never discard a reviewed/edited blog.
  draft.prepared ||= {};
  if (!draft.prepared[target]) {
    if (target === "shorts") draft.shorts = shortsMaterial(draft);
    draft.prepared[target] = new Date().toISOString();
  }
  return draft;
}
function samePost(draft, post) {
  if (draft.externalId && String(post.id) === String(draft.externalId)) return true;
  if (draft.publishedUrl && post.url === draft.publishedUrl) return true;
  const attemptedAt = Date.parse(draft.attemptedAt);
  const publishedAt = Date.parse(post.published);
  if (!Number.isFinite(attemptedAt) || !Number.isFinite(publishedAt) || publishedAt < attemptedAt - 300000) return false;
  const title = (text) => String(text || "").normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
  const body = String(post.content || "").replaceAll("&amp;", "&");
  return title(post.title) === title(draft.title) && body.includes(draft.product.sourceUrl);
}
export function reconcileChannel(state, channel, posts, { error = "", checkedAt = new Date().toISOString() } = {}) {
  state.recovery ||= {};
  state.results ||= {};
  state.results[channel] ||= {};
  state.history ||= [];
  if (error) {
    state.recovery[channel] = { checkedAt, message: "발행 결과를 확인하지 못했습니다. 다시 확인해 주세요." };
    return;
  }
  state.publications ||= {};
  // Retain old observations when an RSS feed rolls older public posts out of its window.
  const observed = new Map((state.publications[channel] || []).map((post) => [post.publishedUrl, post]));
  for (const post of posts) if (post.url) observed.set(post.url, { title: post.title, content: post.content, publishedUrl: post.url });
  state.publications[channel] = [...observed.values()];
  for (const draft of Object.values(state.drafts)) {
    if (draft.channelId !== channel || !UNCERTAIN.has(draft.state)) continue;
    const identity = { ...draft, externalId: "", publishedUrl: "" };
    try { assertIdentity(identity); }
    catch { draft.error = "채널과 기존 글 보호 규칙을 확인해 주세요."; continue; }
    const matches = posts.filter((post) => samePost(draft, post));
    if (matches.length !== 1) {
      draft.state = "needs_reconciliation";
      draft.error = matches.length ? "같은 내용의 글이 여러 개 있어 확인이 필요합니다." : "아직 공개 글을 확인하지 못했습니다. 중복 방지를 위해 재발행하지 않습니다.";
      continue;
    }
    const post = matches[0];
    let publishedUrl;
    try { publishedUrl = publishedUrlFor(draft, { status: "published", publishedUrl: post.url, externalId: post.id }); }
    catch { draft.error = "새 글의 주소를 확인하지 못했습니다."; continue; }
    const record = { product: draft.product, channelId: channel, publishedUrl, externalId: post.id || "", publishedAt: post.published || checkedAt, verifiedAt: checkedAt };
    state.results[channel][draft.id] = record;
    Object.assign(draft, { ...record, state: "published", error: "" });
    state.history.push({ id: draft.id, channelId: channel, event: "publication_recovered", publishedUrl, checkedAt });
  }
  const pending = Object.values(state.drafts).some((draft) => draft.channelId === channel && UNCERTAIN.has(draft.state));
  state.recovery[channel] = { checkedAt, message: pending ? "확인되지 않은 글이 남아 있습니다. 재발행하지 않고 자료를 보존합니다." : "발행 결과를 확인했습니다." };
}

export function migrateResults(state) {
  state.results ||= {};
  for (const draft of Object.values(state.drafts || {})) {
    if (draft.state !== "published" || !draft.publishedUrl) continue;
    try { publishedUrlFor(draft, { status: "published", publishedUrl: draft.publishedUrl, externalId: draft.externalId }); }
    catch { continue; }
    state.results[draft.channelId] ||= {};
    state.results[draft.channelId][draft.id] ||= { product: draft.product, channelId: draft.channelId, publishedUrl: draft.publishedUrl, externalId: draft.externalId || "", publishedAt: draft.publishedAt };
  }
  return state;
}
