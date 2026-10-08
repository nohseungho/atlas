import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { assertNewPost, failedBeforePublishConfirmed } from '../lib/atlas/publish-transaction.js';
import { pngIntegrityIssue } from '../lib/atlas/png-integrity.js';

const ID = 'kr_kr_info_bedding_cleaner_2026';
const ASSET = 'public/atlas/korea/suho/reviewed/bedding-bedroom-suho-v2.png';
const HASH = '3e31cf3eb5e9efe80a04b486ef7b1e6551fa1c9cc37de7af4eb9e22193142bc6';
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

export function applyBeddingSuhoFace(root) {
  const file = path.join(root, 'data/atlas/korea-drafts.json');
  const original = fs.readFileSync(file);
  const data = JSON.parse(original.toString('utf8').replace(/^\uFEFF/, ''));
  const matches = (data.items || []).filter((item) => item.id === ID);
  if (matches.length !== 1) throw new Error('침구청소기 원고를 하나로 확인하지 못했습니다. 원고를 변경하지 않았습니다.');
  const draft = matches[0];
  assertNewPost(draft);
  if (draft.blogId !== 'who-ami' || draft.character !== 'suho') throw new Error('국내 수호 원고가 아닙니다.');
  if (draft.state === 'publishing' || draft.workflowState === 'PUBLISHING') throw new Error('발행 작업 중에는 교체할 수 없습니다.');
  const transactionFile = path.join(root, '.atlas-data/publish-transactions', `${hash(`korea:${ID}`)}.json`);
  if (fs.existsSync(transactionFile)) {
    const transaction = JSON.parse(fs.readFileSync(transactionFile, 'utf8'));
    if (['PUBLISHING', 'RESULT_UNKNOWN', 'PUBLISHED'].includes(transaction.state) && !failedBeforePublishConfirmed(transaction, 'korea')) throw new Error(`발행 결과 확인이 필요한 원고입니다 (${transaction.state}). 교체를 중단했습니다. 기존 발행 기록은 보존했습니다.`);
  }
  const first = draft.images?.[0];
  if (!first?.id || draft.images.length < 3) throw new Error('기존 이미지 세트를 확인하지 못했습니다.');
  const target = path.join(root, ASSET);
  const bytes = fs.readFileSync(target);
  if (hash(bytes) !== HASH || pngIntegrityIssue(bytes)) throw new Error('교체 이미지 파일 검증에 실패했습니다.');
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(first.id)) throw new Error('이미지 슬롯 식별자를 확인하지 못했습니다.');
  const canonical = path.join(root, 'public/atlas/korea/suho/bedding_cleaner_2026/info_why.png');
  const destination = path.join(root, '.atlas-data/korea-assets', ID, `${first.id}.png`);
  const publicSource = '/atlas/korea/suho/bedding_cleaner_2026/info_why.png';
  const matchesBytes = (file) => fs.existsSync(file) && hash(fs.readFileSync(file)) === HASH;
  if (first.src === destination && first.sceneArtSource === publicSource && matchesBytes(destination) && matchesBytes(canonical)) return { status: 'already_applied' };
  const backupDir = path.join(root, '.atlas-data/backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const backup = path.join(backupDir, `korea-drafts-before-suho-face-${crypto.randomUUID()}.json`);
  fs.writeFileSync(backup, original, { flag: 'wx' });
  if (!fs.readFileSync(file).equals(original)) throw new Error('원고가 동시에 변경돼 교체를 중단했습니다.');
  for (const [index, imageFile] of [canonical, destination].entries()) {
    if (fs.existsSync(imageFile)) fs.copyFileSync(imageFile, `${backup}.image-${index}.png`);
    fs.mkdirSync(path.dirname(imageFile), { recursive: true });
    const imageTemporary = `${imageFile}.${crypto.randomUUID()}.tmp`;
    fs.writeFileSync(imageTemporary, bytes, { flag: 'wx' });
    fs.renameSync(imageTemporary, imageFile);
  }
  draft.images[0] = { ...first, src: destination, sceneArtSource: publicSource, uploadedAt: new Date().toISOString(), originalName: 'bedding-bedroom-suho-v2.png' };
  delete draft.images[0].faceMatch;
  delete draft.images[0].faceProof;
  draft.userPublishApproval = null;
  draft.finalReview = null;
  draft.articleDocument = null;
  draft.approvedAt = '';
  draft.stagedAt = '';
  draft.stagedEditorUrl = '';
  draft.state = 'ready_for_review';
  draft.workflowState = 'REVIEW_READY';
  draft.automationStatus = 'assets_ready';
  draft.updatedAt = new Date().toISOString();
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(data, null, 2)}\n`, { flag: 'wx' });
    if (!fs.readFileSync(file).equals(original)) throw new Error('원고가 동시에 변경돼 교체를 중단했습니다.');
    fs.renameSync(temporary, file);
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  return { status: 'applied', backup, image: publicSource };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const root = process.cwd();
    if (execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).trim() !== 'fix/naver-rss-dedupe') throw new Error('ATLAS 작업 브랜치가 아닙니다.');
    console.log(JSON.stringify(applyBeddingSuhoFace(root), null, 2));
    console.log('첫 번째 수호 이미지 반영 완료. 플랫폼을 새로고침하세요. 실제 발행은 하지 않았습니다.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
