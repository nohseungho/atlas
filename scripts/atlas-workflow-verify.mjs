// Offline verification: disposable data, localhost:3002, no publisher calls.
import fs from 'fs';
import os from 'os';
import path from 'path';
import assert from 'node:assert/strict';
import { randomUUID } from 'crypto';
import { spawn } from 'child_process';
import { chromium } from 'playwright-core';
import { findBrowserExecutable } from '../lib/atlas/naver-browser-publisher.js';
import { directionFor } from '../lib/atlas/operate/scene-direction.js';
import { buildGlobalMasterPackage } from '../lib/atlas/operate/global-dialogue-writer.js';
import { globalTopics } from '../lib/atlas/operate/topic-catalog.js';
import { buildArticleFromMaster } from '../lib/atlas/article-factory.js';
import { createKoreaDocument } from '../lib/atlas/article-document.js';
import { finalReviewCode } from '../lib/atlas/final-review.js';

const root = process.cwd();
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-workflow-'));
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'lib/atlas/fixtures/bedding-review.json')));
fixture.id += `_${randomUUID()}`;
fixture.topicId = 'kr_info_fixture_bedding';
fixture.state = 'ready_for_review';
fixture.updatedAt = new Date().toISOString();
const assetDir = path.join(root, '.atlas-data/korea-assets', fixture.id);
assert.ok(!fs.existsSync(assetDir), 'fixture asset directory must be new');
fs.mkdirSync(assetDir, { recursive: true });
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAX+XDSwAAAABJRU5ErkJggg==', 'base64');
fixture.images.forEach((image, index) => {
  image.src = path.join(assetDir, `${image.id}.png`);
  fs.writeFileSync(image.src, Buffer.concat([png, Buffer.from([index])]));
  image.direction = directionFor('korea', image.role);
});
const globalArticle = { ...buildArticleFromMaster(buildGlobalMasterPackage(globalTopics()[0]), { id: 'fixture_global', status: 'written' }), topicId: 'gl_info_fixture', updatedAt: fixture.updatedAt };
for (const name of fs.readdirSync(path.join(root, 'data/atlas')).filter((name) => name.endsWith('.json'))) fs.copyFileSync(path.join(root, 'data/atlas', name), path.join(dataDir, name));
fs.writeFileSync(path.join(dataDir, 'korea-drafts.json'), JSON.stringify({ items: [fixture] }));
fs.writeFileSync(path.join(dataDir, 'articles.json'), JSON.stringify({ articles: [globalArticle] }));
let browser;
let server;
let output = '';
const base = 'http://127.0.0.1:3002';
async function post(body) {
  const response = await fetch(`${base}/api/atlas/operate`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify(body) });
  return { status: response.status, data: await response.json() };
}
try {
  server = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'dev', '-p', '3002', '--hostname', '127.0.0.1'], { env: { ...process.env, ATLAS_DATA_DIR: dataDir }, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const stream of [server.stdout, server.stderr]) stream.on('data', (chunk) => { output = (output + chunk).slice(-12000); });
  let state;
  for (let i = 0; i < 120; i++) {
    if (server.exitCode !== null) throw new Error(`server exited: ${output}`);
    try { const response = await fetch(`${base}/api/atlas/operate`); if (response.ok) { state = await response.json(); break; } } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.equal(state?.status, 'ok', output);
  const original = state.state.korea_naver.review;
  assert.ok(original.blocking.some((issue) => issue.startsWith('최종 글·이미지')));
  const dry = await post({ action: 'dryRun', channelId: 'korea_naver', id: fixture.id });
  assert.equal(dry.status, 200);
  assert.deepEqual(dry.data.document, createKoreaDocument(fixture));
  assert.equal(dry.data.imageAnchors.length, 3);
  assert.equal(new Set(dry.data.imageAnchors.map((image) => image.anchorAfter)).size, 3);
  const foreign = await post({ action: 'dryRun', channelId: 'global_blogger', id: globalArticle.id });
  assert.equal(foreign.status, 200);
  assert.equal(foreign.data.ready, false);
  assert.equal(foreign.data.review.images.length, 5);
  assert.ok(foreign.data.review.faceIssues.length, 'missing face proofs must block');
  assert.equal((await post({ action: 'approvePublish', channelId: 'korea_naver', id: fixture.id, contentHash: original.contentHash, confirm: '발행' })).status, 409);
  assert.equal((await post({ action: 'recordFinalReview', channelId: 'korea_naver', id: fixture.id, reviewCode: finalReviewCode(original) })).status, 200);
  assert.equal((await post({ action: 'approvePublish', channelId: 'korea_naver', id: fixture.id, contentHash: original.contentHash, confirm: '발행' })).status, 200);
  const edited = await post({ action: 'saveReview', channelId: 'korea_naver', id: fixture.id, title: `${fixture.title} (검증)`, text: fixture.bodyText });
  assert.equal(edited.status, 200);
  const updated = edited.data.state.korea_naver.draft;
  assert.equal(updated.workflowState, 'REVIEW_READY');
  assert.equal(updated.userPublishApproval, null);
  assert.equal(updated.finalReview, null);
  assert.equal((await post({ action: 'recordFinalReview', channelId: 'korea_naver', id: fixture.id, reviewCode: finalReviewCode(original) })).status, 409);
  const protectedUpdate = await fetch(`${base}/api/articles/upload-visuals`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ mode: 'sync', articleId: globalArticle.id }) });
  assert.equal(protectedUpdate.status, 409);
  assert.equal((await protectedUpdate.json()).errorCode, 'EXISTING_POST_PROTECTED');
  console.log('PASS: Korea/Blogger dry-runs, approval gate, edit invalidation; publisher calls: 0');
  browser = await chromium.launch({ executablePath: findBrowserExecutable(), headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  const stageRequests = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname === '127.0.0.1' && url.pathname === '/api/atlas/korea-publish') {
      const body = request.postDataJSON();
      assert.equal(body.mode, 'stage');
      stageRequests.push(body);
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'staged' }) });
    }
    if (url.hostname !== '127.0.0.1' || /\/api\/(?:publish|atlas\/korea-publish)$/.test(url.pathname)) return route.abort();
    return route.continue();
  });
  await page.goto(`${base}/atlas/operate`);
  await page.getByRole('button', { name: '국내 블로그 만들기' }).waitFor();
  await page.getByRole('button', { name: '국내 블로그 만들기' }).click();
  await page.getByRole('heading', { name: '전체 글·이미지 미리보기' }).waitFor();
  assert.equal(await page.locator('#article-preview img').count(), 3);
  assert.equal(await page.getByRole('button', { name: '발행', exact: true }).isDisabled(), true);
  await page.getByRole('button', { name: '네이버 편집기 검증 (발행 안 함)', exact: true }).click();
  await page.getByText('네이버 편집기에 글과 이미지를 배치하고 순서를 검증했습니다.', { exact: false }).waitFor();
  assert.deepEqual(stageRequests, [{ id: fixture.id, mode: 'stage' }]);
  assert.equal((await fetch(`${base}/api/atlas/operate`).then((response) => response.json())).state.korea_naver.draft.userPublishApproval, null);
  const imageAnchors = await page.locator('#article-preview figure').evaluateAll((figures) => figures.map((figure) => ({ anchor: figure.dataset.anchorAfter, previous: figure.previousElementSibling?.id })));
  assert.ok(imageAnchors.every((image) => image.anchor === image.previous));
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '최종 글·이미지 검수 묶음 저장' }).click();
  const download = await downloaded;
  const bundlePath = path.join(dataDir, 'review-bundle.html');
  await download.saveAs(bundlePath);
  const bundle = fs.readFileSync(bundlePath, 'utf8');
  assert.equal((bundle.match(/src="data:image\/png;base64,/g) || []).length, 3);
  assert.ok(bundle.includes('atlas-review') && bundle.includes('finalReviewHash'));
  await page.screenshot({ path: '/tmp/atlas-korea-verified.png', fullPage: true });
  await page.getByRole('button', { name: /해외 · 미지/ }).click();
  await page.getByRole('heading', { name: '전체 글·이미지 미리보기' }).waitFor();
  assert.equal(await page.getByRole('button', { name: '발행', exact: true }).isDisabled(), true);
  await page.screenshot({ path: '/tmp/atlas-global-verified.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log('PASS: localhost:3002 landing, both channels, preview anchors, disabled publishing, no browser exceptions');
} finally {
  if (browser) await browser.close();
  if (server && server.exitCode === null) {
    const exited = new Promise((resolve) => server.once('exit', resolve));
    server.kill('SIGTERM');
    await exited;
  }
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.rmSync(assetDir, { recursive: true, force: true });
}
