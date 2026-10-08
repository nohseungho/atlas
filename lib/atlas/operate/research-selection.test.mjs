import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveResearchSelection, researchTopic } from './research-selection.js';
import { koreaTopics, globalTopics } from './topic-catalog.js';
import { buildKoreaInfoDraft } from './korea-info-writer.js';
import { buildGlobalMasterPackage } from './global-dialogue-writer.js';
import { normalizeKoreaDraft } from '../korea-product-pipeline.js';
import { validateMasterPackage } from '../article-factory.js';

const checkedAt = new Date().toISOString();
const issue = { title: '가을 침구 관리와 침구청소기 비교', url: 'https://example.org/bedding', source: 'Example', publishedAt: checkedAt };
const report = { checkedAt, issues: [issue], references: [{ ...issue, url: 'https://blog.naver.com/example/1' }], products: [{ name: '침구청소기', url: 'https://example.org/product' }] };
test('only accepts a current selection from the saved report, ignoring client-supplied facts', () => {
  const selection = { kind: 'issue', url: issue.url, checkedAt, title: '다른 제목' };
  assert.equal(resolveResearchSelection(report, selection).title, issue.title);
  assert.throws(() => resolveResearchSelection(report, { ...selection, url: 'https://example.org/unlisted' }));
  assert.throws(() => resolveResearchSelection(report, { ...selection, checkedAt: 'older' }));
  assert.throws(() => resolveResearchSelection(report, selection, Date.now() + 86400001));
  assert.throws(() => resolveResearchSelection({ ...report, stale: true }, selection));
  assert.equal(resolveResearchSelection(report, { kind: 'product', url: report.products[0].url, checkedAt }).name, '침구청소기');
});
test('selected issue becomes a distinct Korean draft with source context and survives normalization', () => {
  const source = resolveResearchSelection(report, { kind: 'issue', url: issue.url, checkedAt });
  const topic = researchTopic(source, koreaTopics(), 'korea_naver');
  const draft = normalizeKoreaDraft({ ...buildKoreaInfoDraft(topic), researchSelection: topic.researchSelection });
  assert.ok(draft.title.startsWith(issue.title));
  assert.ok(draft.bodyText.includes(issue.title));
  assert.ok(draft.bodyText.includes(issue.url));
  assert.equal(draft.researchSelection.url, issue.url);
  assert.equal(draft.sources[0].checkedAt, checkedAt);
  assert.match(draft.id, /^kr_kr_info_research_/);
  assert.ok(draft.images.every((img) => !img.src));
  assert.equal(researchTopic(source, koreaTopics(), 'korea_naver').id, topic.id);
  assert.notEqual(researchTopic({ ...source, url: 'https://example.org/other' }, koreaTopics(), 'korea_naver').id, topic.id);
});
test('unrelated references cannot silently create an unrelated catalogue article', () => {
  assert.throws(() => researchTopic({ title: '주식 기업 실적 발표', url: 'https://example.org/stocks', kind: 'reference', checkedAt }, koreaTopics(), 'korea_naver'), /다른 주제의 글로 대체하지/);
});
test('global selection binds source context, keeps Miji five-image policy and a valid master package', () => {
  const source = { title: 'Travel packing luggage checklist', url: 'https://example.org/travel', kind: 'issue', checkedAt };
  const topic = researchTopic(source, globalTopics(), 'global_blogger');
  const master = buildGlobalMasterPackage(topic);
  assert.ok(master.title.startsWith(source.title));
  assert.ok(master.bodyMarkdown.includes(source.title));
  assert.equal(master.sources[0].url, source.url);
  assert.equal(master.visualAssets.length, 5);
  const result = validateMasterPackage(master, { articles: [], mode: 'production' });
  assert.equal(result.ok, true, result.errors?.join('\n'));
});
