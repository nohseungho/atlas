// Durable, cross-process claim. Never expire an uncertain external write and
// blindly retry: a timeout can occur after Naver/Blogger accepted the post.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export const WORKFLOW_STATE = Object.freeze({ DRAFT: 'DRAFT', GENERATED: 'GENERATED', REVIEW_READY: 'REVIEW_READY', USER_APPROVED: 'USER_APPROVED', PUBLISHING: 'PUBLISHING', PUBLISHED: 'PUBLISHED' });
export function contentVersion(record) {
  const keys = ['id', 'title', 'keyword', 'category', 'topicId', 'blogId', 'contentType', 'channelId', 'character', 'visualMode', 'masterAssetPath', 'bodyText', 'bodyMarkdown', 'bodyHtml', 'masterMarkdown', 'masterHtml', 'masterApproved', 'quickAnswer', 'faq', 'comparisonCriteria', 'comparisonTable', 'sources', 'researchSelection', 'trust', 'images', 'visualAssets', 'productName', 'productInfo', 'productUrl', 'affiliateUrl', 'affiliateDisclosure', 'affiliatePlan', 'seoLabels', 'metaDescription', 'heroImageUrl', 'tags'];
  return crypto.createHash('sha256').update(JSON.stringify(keys.map((key) => [key, record[key]]))).digest('hex');
}
// Hosting the same verified bytes changes delivery metadata, not the reviewed work.
export function reviewContentVersion(record) {
  return contentVersion({ ...record, visualAssets: record.visualAssets?.map(({ publicUrl: _url, publicImageHash: _hash, ...asset }) => asset) });
}
export function assertNewPost(record) {
  if (record.logNo || record.naverUrl || record.bloggerPostId || record.publishedUrl || record.state === 'published' || record.status === 'published' || record.workflowState === WORKFLOW_STATE.PUBLISHED || record.contentType === 'existing_post_update') {
    throw Object.assign(new Error('기존 공개 글은 이 제작·발행 경로에서 수정하거나 다시 게시할 수 없습니다.'), { code: 'EXISTING_POST_PROTECTED' });
  }
}
export function failedBeforePublishConfirmed(transaction, channel) {
  return Boolean(transaction && !transaction.url && !transaction.postId && !transaction.logNo && !transaction.publishedUrl && !transaction.naverUrl && (
    transaction.state === 'FAILED_BEFORE_PUBLISH' && transaction.publishAttempted === false
    || channel === 'korea' && transaction.state === 'RESULT_UNKNOWN' && transaction.error === '네이버 본문 입력 영역을 찾지 못했습니다.'
  ));
}
export function workflowStateOf(record) {
  if (record.publishedUrl || record.state === 'published' || record.status === 'published') return WORKFLOW_STATE.PUBLISHED;
  if (record.state === 'publishing' || record.publishState === 'publishing') return WORKFLOW_STATE.PUBLISHING;
  if (record.userPublishApproval && !record.userPublishApproval.usedAt && record.userPublishApproval.approvedVersion === contentVersion(record)) return WORKFLOW_STATE.USER_APPROVED;
  if (record.bodyText || record.bodyMarkdown || record.bodyHtml) return WORKFLOW_STATE.REVIEW_READY;
  if ((record.images || record.visualAssets || []).length) return WORKFLOW_STATE.GENERATED;
  return WORKFLOW_STATE.DRAFT;
}
function fail(code, message) { throw Object.assign(new Error(message), { code }); }
export function createPublishTransactions(root = path.join(process.cwd(), '.atlas-data', 'publish-transactions')) {
  fs.mkdirSync(root, { recursive: true });
  const name = (channel, id) => crypto.createHash('sha256').update(`${channel}:${id}`).digest('hex');
  const read = (channel, id) => { try { return JSON.parse(fs.readFileSync(path.join(root, `${name(channel, id)}.json`), 'utf8')); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } };
  const write = (channel, id, value) => {
    const target = path.join(root, `${name(channel, id)}.json`);
    const tmp = `${target}.${crypto.randomUUID()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(value));
    fs.renameSync(tmp, target);
  };
  return {
    read,
    claim(channel, record, review) {
      assertNewPost(record);
      const approval = record.userPublishApproval;
      if (record.workflowState !== WORKFLOW_STATE.USER_APPROVED || !approval || approval.usedAt || approval.contentHash !== review.contentHash || approval.approvedVersion !== contentVersion(record) || review.blocking.length || !Number.isFinite(Date.parse(approval.approvedAt)) || Date.now() < Date.parse(approval.approvedAt) || Date.now() - Date.parse(approval.approvedAt) > 15 * 60 * 1000) fail('USER_PUBLISH_APPROVAL_REQUIRED', '내용이 일치하는 최종 사용자 승인이 필요합니다.');
      const lock = path.join(root, `${name(channel, record.id)}.lock`);
      try { fs.mkdirSync(lock); } catch (error) { if (error.code !== 'EEXIST') throw error; fail('PUBLISH_IN_PROGRESS', '이미 게시 중입니다.'); }
      try {
        const existing = read(channel, record.id);
        // Legacy worker could only throw this exact error before clicking Publish.
        // All other unknown outcomes still require reconciliation, never a retry.
        const beforePublishFailure = failedBeforePublishConfirmed(existing, channel);
        if (existing && !beforePublishFailure) fail(existing.state === 'PUBLISHED' ? 'ALREADY_PUBLISHED' : 'PUBLISH_RECONCILIATION_REQUIRED', existing.url ? `이미 게시되었습니다: ${existing.url}` : '이전 게시 결과를 확인해야 합니다. 중복 게시를 막기 위해 재시도를 중단했습니다.');
        const transaction = { channel, articleId: record.id, approvedVersion: approval.approvedVersion,
          key: `${channel}:${record.id}:${approval.approvedVersion}`, token: crypto.randomUUID(), state: 'PUBLISHING', startedAt: new Date().toISOString() };
        if (beforePublishFailure) transaction.previousFailure = { token: existing.token, state: existing.state, error: existing.error, startedAt: existing.startedAt };
        write(channel, record.id, transaction);
        return transaction;
      } finally { fs.rmdirSync(lock); }
    },
    verify(transaction) {
      const saved = read(transaction?.channel, transaction?.articleId);
      if (!saved || saved.token !== transaction?.token || saved.state !== 'PUBLISHING') fail('PUBLISH_TRANSACTION_REQUIRED', '유효한 발행 작업 잠금이 없습니다.');
    },
    finish(transaction, receipt) {
      this.verify(transaction);
      if (!receipt?.url || !receipt?.postId) fail('PUBLISH_RESULT_UNVERIFIED', '게시물 ID와 성공 URL을 확인하지 못했습니다. 다시 게시하지 말고 결과를 확인하세요.');
      const saved = { ...transaction, ...receipt, state: 'PUBLISHED', publishedAt: new Date().toISOString() };
      write(transaction.channel, transaction.articleId, saved);
      return saved;
    },
    uncertain(transaction, error) {
      this.verify(transaction);
      write(transaction.channel, transaction.articleId, { ...transaction, state: 'RESULT_UNKNOWN', error: String(error?.message || error) });
    },
    failedBeforePublish(transaction, error) {
      this.verify(transaction);
      if (error?.publishAttempted !== false) fail('PUBLISH_RESULT_UNVERIFIED', '발행 버튼을 누르지 않았다는 확인이 필요합니다.');
      write(transaction.channel, transaction.articleId, { ...transaction, state: 'FAILED_BEFORE_PUBLISH', publishAttempted: false, error: String(error.message), errorCode: error.code, failedAt: new Date().toISOString() });
    },
  };
}
