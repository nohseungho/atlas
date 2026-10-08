import crypto from 'node:crypto';
import { relatedTo } from './topic-research.js';

function reject(message) { throw Object.assign(new Error(message), { code: 'RESEARCH_SELECTION_INVALID', httpStatus: 422 }); }

// Resolve against the saved update, never against a client-supplied title or URL alone.
export function resolveResearchSelection(report, selection, now = Date.now()) {
  const age = now - Date.parse(report?.checkedAt);
  if (!report || report.stale || !Number.isFinite(age) || age < 0 || age >= 86400000 || selection.checkedAt !== report.checkedAt) reject('자료가 갱신되었거나 오래됐습니다. 업데이트 후 다시 선택하세요.');
  const list = selection.kind === 'issue' ? report.issues : selection.kind === 'reference' ? report.references
    : selection.kind === 'product' ? [...(report.products || []), ...(report.issues || []).flatMap((item) => item.products || [])] : [];
  const item = (list || []).find((entry) => entry.url === selection.url);
  if (!item || !/^https:\/\//.test(item.url)) reject('업데이트 결과에서 선택한 자료를 찾지 못했습니다.');
  return { ...item, kind: selection.kind, checkedAt: report.checkedAt };
}

// Use the selected source as the article identity and opening context. A related
// guide supplies practical advice; the news headline never becomes invented facts.
export function researchTopic(source, topics, channelId) {
  const related = topics.filter((topic) => relatedTo(source.title, `${topic.title} ${topic.keyword}`));
  if (!related.length) reject('이 자료와 연결되는 검증된 작성 자료가 없습니다. 다른 주제의 글로 대체하지 않았습니다.');
  const terms = source.title.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 1);
  const score = (topic) => terms.filter((word) => `${topic.title} ${topic.keyword}`.toLowerCase().includes(word)).length;
  const base = [...related].sort((a, b) => score(b) - score(a))[0];
  const korea = channelId === 'korea_naver';
  const suffix = crypto.createHash('sha256').update(`${source.kind}:${source.url}`).digest('hex').slice(0, 16);
  const selection = { kind: source.kind, title: source.title, url: source.url, source: source.source || new URL(source.url).hostname,
    publishedAt: source.publishedAt || '', checkedAt: source.checkedAt, baseTopicId: base.id };
  const topic = structuredClone(base);
  topic.id = `${korea ? 'kr' : 'gl'}_info_research_${suffix}`;
  topic.slug = `research-${suffix}`;
  topic.title = korea ? `${source.title} — 생활에서 확인할 점` : `${source.title} — practical checks for travellers`;
  topic.researchSelection = selection;
  topic.sources = [{ title: source.title, url: source.url, checkedAt: source.checkedAt, publishedAt: source.publishedAt || '' }, ...(base.sources || []).filter((item) => item.url !== source.url)];
  const context = korea
    ? `이번 글은 업데이트에서 선택한 「${source.title}」를 계기로 ${base.keyword}을 살펴봅니다. 자료 확인 시각: ${source.checkedAt}. 아래 내용은 관련 생활 기준이며, 뉴스 제목만으로 제품 성능이나 정책 변경이 확인됐다고 단정하지 않습니다.`
    : `This guide starts with the selected source, “${source.title}”, checked at ${source.checkedAt}, and examines ${base.keyword}. The practical advice below is separate from the headline; a headline alone does not establish a new policy or product claim.`;
  if (korea) topic.lead = `${context}\n\n${base.lead}`;
  else {
    topic.dialogue[0].turns.unshift(['Miji', context]);
    topic.metaDescription = `Practical checks for ${base.keyword}, prompted by the selected source: ${source.title}`.slice(0, 160);
    topic.koreanReview = `${source.title} 자료를 선택해 ${base.keyword} 관련 확인 사항을 작성했습니다. 뉴스 제목 이상의 사실은 원문 검수가 필요합니다.`;
  }
  return topic;
}
