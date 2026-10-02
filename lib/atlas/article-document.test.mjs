import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { createKoreaDocument, documentIssues, editorDocumentIssues, koreanStyleIssues, renderArticleDocument } from './article-document.js';
import { buildGlobalDocument, buildBloggerHtml, buildLocalPreviewHtml } from '../html-exporter.js';
import { contentVersion, assertNewPost, createPublishTransactions } from './publish-transaction.js';
import { buildReviewPacket, userApprovalIssues } from './publish-review.js';
import { faceMatchPassed } from './face-match.js';
import { finalReviewCode, addFinalReviewGate } from './final-review.js';
import { parseResearchFeed, relatedTo } from './operate/topic-research.js';
import { directionFor } from './operate/scene-direction.js';
import { koreaTopics } from './operate/topic-catalog.js';
import { buildKoreaInfoDraft } from './operate/korea-info-writer.js';
import { bloggerProvider } from './providers/blogger-provider.js';
import { requestOriginAllowed } from './request-origin.js';
import { faceProofPassed, fileDigest } from './face-proof.js';

const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/bedding-review.json', import.meta.url)));
const draft = () => ({ ...structuredClone(fixture), images: fixture.images.map((image) => ({ ...image, direction: directionFor("korea", image.role) })) });
const packet = (record) => buildReviewPacket({ channel: 'korea', record, images: record.images.map((image) => ({ role: image.role, src: image.src, ready: true })) });
function approve(record) {
  const review = packet(record);
  record.userPublishApproval = { contentHash: review.contentHash, approvedVersion: contentVersion(record), approvedAt: new Date().toISOString(), confirm: '발행' };
  record.workflowState = 'USER_APPROVED';
  return review;
}

test('A: bedding three images stay directly below the specified distinct headings in preview and publisher model', () => {
  const record = draft();
  const document = createKoreaDocument(record);
  assert.deepEqual(documentIssues(document, record), []);
  const images = document.blocks.filter((block) => block.type === 'image');
  assert.equal(images.length, 3);
  assert.equal(new Set(images.map((image) => image.anchorAfter)).size, 3);
  const headings = ['침구청소기 하나만 있으면 끝일까?', '살 때는 이 세 가지를 먼저 봤어요', '구매 전에 한 번만 체크해보세요'];
  images.forEach((image, i) => assert.equal(document.blocks[document.blocks.indexOf(image) - 1].text, headings[i]));
  const html = renderArticleDocument(document);
  for (const image of images) assert.ok(html.includes(`data-anchor-after="${image.anchorAfter}"`));
  assert.deepEqual(editorDocumentIssues(document, document.blocks), []);
  // Splitting lines in SmartEditor may differ; content/order cannot.
  const split = document.blocks.flatMap((block) => block.type === 'image' ? [block] : block.text.split('\n').map((text) => ({ type: 'paragraph', text })));
  assert.deepEqual(editorDocumentIssues(document, split), []);
});

test('default domestic writer produces natural prose and the requested bedding anchors', () => {
  for (const topic of koreaTopics()) assert.deepEqual(koreanStyleIssues(buildKoreaInfoDraft(topic).bodyText), [], topic.id);
  const topic = koreaTopics().find((item) => item.id === 'kr_info_bedding_cleaner_2026');
  const document = createKoreaDocument(buildKoreaInfoDraft(topic));
  assert.deepEqual(document.blocks.filter((block) => block.type === 'image').map((block) => document.blocks[document.blocks.indexOf(block) - 1].text), [
    '침구청소기 하나만 있으면 끝일까?', '살 때는 이 세 가지를 먼저 봤어요', '구매 전에 한 번만 체크해보세요',
  ]);
});

test('B: all three images at the bottom, wrong count/order/anchor, and merged body fail', () => {
  const document = createKoreaDocument(draft());
  const texts = document.blocks.filter((block) => block.type !== 'image');
  const images = document.blocks.filter((block) => block.type === 'image');
  assert.ok(editorDocumentIssues(document, [...texts, ...images]).length);
  assert.ok(editorDocumentIssues(document, document.blocks.filter((block) => block !== images[1])).length);
  const swapped = structuredClone(document.blocks);
  const first = swapped.findIndex((block) => block.assetId === images[0].assetId);
  const second = swapped.findIndex((block) => block.assetId === images[1].assetId);
  [swapped[first], swapped[second]] = [swapped[second], swapped[first]];
  assert.ok(editorDocumentIssues(document, swapped).length);
  const record = draft(); record.images[1].anchorAfter = 'nonexistent';
  assert.ok(documentIssues(createKoreaDocument(record), record).some((issue) => issue.includes('anchor')));
});

test('C: no approval blocks; approved passes; body/image/anchor changes invalidate the exact approved version', () => {
  const record = draft();
  assert.ok(userApprovalIssues(record, packet(record)).length);
  const review = approve(record);
  assert.deepEqual(userApprovalIssues(record, review), []);
  for (const edit of [(item) => item.bodyText += '\n다른 내용', (item) => item.images[0].src = 'new.png', (item) => item.images[0].anchorAfter = 'section-9']) {
    const edited = structuredClone(record); edit(edited);
    assert.ok(userApprovalIssues(edited, packet(edited)).length);
  }
});

test('D: durable same-version and cross-process duplicate guard; unknown outcome never auto retries', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-transactions-'));
  try {
    const transactions = createPublishTransactions(root);
    const record = draft();
    assert.throws(() => transactions.claim('korea', record, packet(record)), { code: 'USER_PUBLISH_APPROVAL_REQUIRED' });
    const review = approve(record);
    const claim = transactions.claim('korea', record, review);
    assert.throws(() => createPublishTransactions(root).claim('korea', record, review), { code: 'PUBLISH_RECONCILIATION_REQUIRED' });
    transactions.finish(claim, { platform: 'naver', postId: '123', url: 'https://blog.naver.com/who-ami/123' });
    assert.equal(transactions.read('korea', record.id).url, 'https://blog.naver.com/who-ami/123');
    assert.throws(() => transactions.claim('korea', record, review), { code: 'ALREADY_PUBLISHED' });
    record.id = 'another'; const second = transactions.claim('korea', record, approve(record));
    transactions.uncertain(second, new Error('timeout after insert'));
    assert.throws(() => transactions.claim('korea', record, approve(record)), { code: 'PUBLISH_RECONCILIATION_REQUIRED' });
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', `import { createPublishTransactions } from ${JSON.stringify(new URL('./publish-transaction.js', import.meta.url).href)}; const tx=createPublishTransactions(${JSON.stringify(root)}); try { tx.claim('korea', ${JSON.stringify(record)}, ${JSON.stringify(packet(record))}); process.exit(1); } catch(e) { if(e.code !== 'PUBLISH_RECONCILIATION_REQUIRED') throw e; }`]);
    assert.equal(child.status, 0, child.stderr.toString());
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('E: Suho default and image identity remain Korea illustration policy; cross-channel identity fails', () => {
  const record = draft();
  assert.equal(createKoreaDocument(record).character, 'suho');
  record.images[0].characterId = 'miji';
  assert.ok(documentIssues(createKoreaDocument(record), record).length);
});

test('F: five Miji images required, every face must have a finite score >= 0.5, failures never pass', () => {
  for (const similarity of [0.49, NaN, undefined]) assert.equal(faceMatchPassed({ status: 'pass', similarity, threshold: 0.1 }), false);
  assert.equal(faceMatchPassed({ status: 'pass', similarity: 0.5 }), true);
  assert.equal(faceMatchPassed({ status: 'fail', similarity: 0.9 }), false);
  const record = { id: 'global-test', title: 'Packing for a trip', character: 'miji', quickAnswer: 'Start with one bag.', bodyMarkdown: '## Pack\nUse a checklist.', faq: [{ question: 'How?', answer: 'Check.' }], comparisonCriteria: ['size'], sources: [{ title: 'Source', url: 'https://example.org/rules' }] };
  const assets = Array.from({ length: 5 }, (_, i) => ({ role: `miji-${i}`, src: `https://example.org/${i}.png`, ready: true, faceMatch: { status: 'pass', similarity: 0.7 } }));
  const review = (images) => buildReviewPacket({ channel: 'global', record, images, faceRequired: true });
  assert.deepEqual(review(assets).blocking, []);
  assert.ok(review(assets.slice(0, 4)).blocking.some((issue) => issue.includes('5장')));
  assets[3].faceMatch.similarity = 0.1;
  assert.ok(review(assets).blocking.some((issue) => issue.includes('얼굴')));
});

test('G: every existing live-post identifier/update mode is protected; direct Blogger publisher rejects missing transaction before network', async () => {
  for (const field of ['logNo', 'naverUrl', 'bloggerPostId', 'publishedUrl']) assert.throws(() => assertNewPost({ [field]: 'existing' }), { code: 'EXISTING_POST_PROTECTED' });
  assert.throws(() => assertNewPost({ contentType: 'existing_post_update' }), { code: 'EXISTING_POST_PROTECTED' });
  await assert.rejects(() => bloggerProvider.publish({}, {}, {}), { code: 'PUBLISH_TRANSACTION_REQUIRED' });
});

test('H: reader prose passes; every requested defensive/internal-policy phrase is caught', () => {
  assert.deepEqual(koreanStyleIssues(draft().bodyText), []);
  for (const phrase of ['여기서 주장하지 않습니다', '단정할 수 없습니다', '재확인해야 합니다', '본 글에서는 순위를 정하지 않습니다', '후보를 고르면 확인해야 합니다', '내부 정책을 설명합니다']) assert.ok(koreanStyleIssues(phrase).length, phrase);
  assert.deepEqual(koreanStyleIssues('UV 기능도 참고할 수 있지만, 세탁과 충분한 건조를 함께 해주는 게 기본입니다.'), []);
});

test('ArcFace proof binds every score to the exact scene file and current Miji master', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-face-proof-'));
  const file = path.join(root, 'scene.png');
  try {
    fs.writeFileSync(file, 'scene one');
    const reference = 'public/atlas/characters/ATLAS-MIJI-MASTER.png';
    const record = { status: 'pass', similarity: 0.7, faces: 1, method: 'arcface_buffalo_l', reference, imageHash: fileDigest(file), referenceHash: fileDigest(reference) };
    assert.equal(faceProofPassed(record, file), true);
    assert.equal(faceProofPassed({ ...record, method: 'operator_review' }, file), false);
    assert.equal(faceProofPassed({ ...record, referenceHash: 'old-master' }, file), false);
    fs.writeFileSync(file, 'different face');
    assert.equal(faceProofPassed(record, file), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('global preview and publisher render the same canonical blocks and prefer approved MASTER', () => {
  const record = { id: 'g', title: 'Guide', language: 'en', bodyMarkdown: '## Draft\nNot selected.', masterApproved: true, masterMarkdown: '## Approved\nUse this content.', visualAssets: [{ key: 'a', placement: 'afterSection:Approved', alt: 'Miji checks a bag', localSrc: '/a.png', publicUrl: 'https://example.org/a.png' }] };
  const document = buildGlobalDocument(record);
  assert.equal(document.character, 'miji');
  assert.equal(buildBloggerHtml(record), buildLocalPreviewHtml(record).replaceAll('src="/a.png"', 'src="https://example.org/a.png"'));
  assert.ok(buildBloggerHtml(record).includes('Use this content.'));
  assert.ok(!buildBloggerHtml(record).includes('Not selected.'));
});

test('final review receipt is separate from publish approval and invalidates on edits', () => {
  const record = draft(); let review = packet(record);
  assert.ok(addFinalReviewGate(record, review).blocking.length);
  record.finalReview = { contentHash: review.finalReviewHash, imageCount: 3, verdict: 'PASS' };
  review = packet(record);
  assert.match(finalReviewCode(review), /^ATLAS-REVIEW:/);
  assert.equal(addFinalReviewGate(record, review).finalReviewReady, true);
  assert.ok(!record.userPublishApproval);
  record.images[0].anchorAfter = 'section-7';
  assert.equal(addFinalReviewGate(record, packet(record)).finalReviewReady, false);
});

test('latest research rejects undated, old and future news; product matches require related subject', () => {
  const now = Date.parse('2026-10-02T12:00:00Z');
  const item = (date, name) => `<item><title>${name}</title><link>https://example.org/${name}</link>${date ? `<pubDate>${date}</pubDate>` : ''}</item>`;
  const xml = item('2026-10-01', 'fresh') + item('2026-09-01', 'old') + item('2026-10-03', 'future') + item('', 'unknown');
  assert.deepEqual(parseResearchFeed(xml, { now, recentOnly: true }).map((entry) => entry.title), ['fresh']);
  assert.equal(relatedTo('가을 침구 관리', '침구청소기'), true);
  assert.equal(relatedTo('가을 침구 관리', '게임 그래픽카드'), false);
});


test('browser Host origin is accepted across Next internal URLs; foreign origins fail', () => {
  const req = (origin) => ({ url: 'http://localhost:3002/api/atlas/operate', headers: new Headers({ Host: '127.0.0.1:3002', Origin: origin }) });
  assert.equal(requestOriginAllowed(req('http://127.0.0.1:3002')), true);
  assert.equal(requestOriginAllowed(req('https://example.org')), false);
  assert.equal(requestOriginAllowed(req('null')), false);
});

test('Blogger target is verified read-only before any insert', async () => {
  const prior = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (url, init) => {
      calls.push({ url, method: init?.method || 'GET' });
      return { ok: true, json: async () => ({ url: 'https://wrong.blogspot.com/' }) };
    };
    await assert.rejects(() => bloggerProvider.assertPublishTarget('test-blog', 'mock'), { code: 'BLOGGER_TARGET_MISMATCH' });
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ url: 'https://atlas-money-2026.blogspot.com/' }) });
    await bloggerProvider.assertPublishTarget('test-blog', 'mock');
    assert.deepEqual(calls.map((call) => call.method), ['GET']);
  } finally { globalThis.fetch = prior; }
});


test('hosting verified bytes preserves final review; different bytes or prose invalidate it', () => {
  const record = { id: 'global-review', title: 'Trip', visualAssets: [{ key: 'a', localSrc: '/a.png' }], bodyMarkdown: 'Pack a bag.' };
  const makePacket = (fingerprint = 'same-bytes') => ({ contentHash: 'delivery-dependent', blocking: [], images: [{ role: 'a', fingerprint }] });
  let review = addFinalReviewGate(record, makePacket());
  record.finalReview = { contentHash: review.finalReviewHash, imageCount: 1, verdict: 'PASS' };
  const version = contentVersion(record);
  record.visualAssets[0].publicUrl = 'https://example.org/upload.png';
  record.visualAssets[0].publicImageHash = 'same-bytes';
  assert.notEqual(contentVersion(record), version);
  assert.equal(addFinalReviewGate(record, makePacket()).finalReviewReady, true);
  assert.equal(addFinalReviewGate(record, makePacket('new-bytes')).finalReviewReady, false);
  record.bodyMarkdown += ' Changed text.';
  assert.equal(addFinalReviewGate(record, makePacket()).finalReviewReady, false);
});
