import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { applyBeddingSuhoFace } from './apply-bedding-suho-face.mjs';

const asset = 'public/atlas/korea/suho/reviewed/bedding-bedroom-suho-v2.png';
function fixture(t, patch = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-suho-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'data/atlas'), { recursive: true });
  fs.mkdirSync(path.dirname(path.join(root, asset)), { recursive: true });
  fs.copyFileSync(new URL(`../${asset}`, import.meta.url), path.join(root, asset));
  const draft = { id: 'kr_kr_info_bedding_cleaner_2026', blogId: 'who-ami', character: 'suho', title: '집에서 수정한 제목', bodyText: '집에서 보존할 본문', state: 'approved', userPublishApproval: { approvedVersion: 'old' }, finalReview: { verdict: 'PASS' }, images: [1, 2, 3].map((n) => ({ id: `img${n}`, src: `old${n}`, anchorKeywords: [`문단${n}`], placement: `${n}번째 위치` })), ...patch };
  const data = { items: [draft, { id: 'other', publishedUrl: 'https://example.com/existing' }], localMetadata: { preserve: true } };
  const file = path.join(root, 'data/atlas/korea-drafts.json');
  fs.writeFileSync(file, JSON.stringify(data));
  return { root, file, data, original: fs.readFileSync(file) };
}
test('replaces first image only, preserves local writing and other records, backs up and invalidates old approval', (t) => {
  const f = fixture(t);
  const result = applyBeddingSuhoFace(f.root);
  const next = JSON.parse(fs.readFileSync(f.file));
  assert.deepEqual(fs.readFileSync(result.backup), f.original);
  assert.equal(next.items[0].bodyText, f.data.items[0].bodyText);
  assert.equal(next.items[0].title, f.data.items[0].title);
  assert.deepEqual(next.items[0].images.slice(1), f.data.items[0].images.slice(1));
  assert.deepEqual(next.items[0].images[0].anchorKeywords, f.data.items[0].images[0].anchorKeywords);
  assert.equal(next.items[0].images[0].placement, f.data.items[0].images[0].placement);
  assert.deepEqual(next.items[1], f.data.items[1]);
  assert.deepEqual(next.localMetadata, f.data.localMetadata);
  assert.equal(next.items[0].userPublishApproval, null);
  assert.equal(next.items[0].finalReview, null);
  assert.equal(applyBeddingSuhoFace(f.root).status, 'already_applied');
});
test('refuses published posts without changing the local draft', (t) => {
  const f = fixture(t, { publishedUrl: 'https://blog.naver.com/who-ami/123' });
  assert.throws(() => applyBeddingSuhoFace(f.root), /기존 공개 글/);
  assert.deepEqual(fs.readFileSync(f.file), f.original);
});
test('refuses an uncertain external publish result', (t) => {
  const f = fixture(t);
  const folder = path.join(f.root, '.atlas-data/publish-transactions');
  fs.mkdirSync(folder, { recursive: true });
  const name = crypto.createHash('sha256').update('korea:kr_kr_info_bedding_cleaner_2026').digest('hex');
  fs.writeFileSync(path.join(folder, `${name}.json`), JSON.stringify({ state: 'RESULT_UNKNOWN' }));
  assert.throws(() => applyBeddingSuhoFace(f.root), /발행 결과/);
  assert.deepEqual(fs.readFileSync(f.file), f.original);
});
test('refuses damaged replacement bytes without changing the draft', (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.root, asset), 'invalid');
  assert.throws(() => applyBeddingSuhoFace(f.root), /이미지 파일 검증/);
  assert.deepEqual(fs.readFileSync(f.file), f.original);
});
test('confirmed pre-publish editor failure allows image replacement and preserves the transaction', (t) => {
  const f = fixture(t);
  const folder = path.join(f.root, '.atlas-data/publish-transactions');
  fs.mkdirSync(folder, { recursive: true });
  const name = crypto.createHash('sha256').update('korea:kr_kr_info_bedding_cleaner_2026').digest('hex');
  const transactionFile = path.join(folder, `${name}.json`);
  const transaction = JSON.stringify({ state: 'RESULT_UNKNOWN', error: '네이버 본문 입력 영역을 찾지 못했습니다.', token: 'preserved' });
  fs.writeFileSync(transactionFile, transaction);
  assert.equal(applyBeddingSuhoFace(f.root).status, 'applied');
  assert.equal(fs.readFileSync(transactionFile, 'utf8'), transaction);
  assert.equal(JSON.parse(fs.readFileSync(f.file)).items[0].userPublishApproval, null);
});
test('similar failure text, successful receipts and in-progress transactions remain protected', (t) => {
  const f = fixture(t);
  const folder = path.join(f.root, '.atlas-data/publish-transactions');
  fs.mkdirSync(folder, { recursive: true });
  const name = crypto.createHash('sha256').update('korea:kr_kr_info_bedding_cleaner_2026').digest('hex');
  const confirmedError = '네이버 본문 입력 영역을 찾지 못했습니다.';
  for (const transaction of [
    { state: 'RESULT_UNKNOWN', error: `${confirmedError} timeout` },
    { state: 'RESULT_UNKNOWN', error: confirmedError, postId: '123' },
    { state: 'RESULT_UNKNOWN', error: confirmedError, url: 'https://blog.naver.com/who-ami/123' },
    { state: 'PUBLISHING', error: confirmedError, publishAttempted: false },
    { state: 'PUBLISHED', error: confirmedError },
  ]) {
    fs.writeFileSync(path.join(folder, `${name}.json`), JSON.stringify(transaction));
    assert.throws(() => applyBeddingSuhoFace(f.root), /발행 결과/);
    assert.deepEqual(fs.readFileSync(f.file), f.original);
  }
});
