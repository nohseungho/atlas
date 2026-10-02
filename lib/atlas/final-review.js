// A returned review receipt refers to exactly the bundle inspected in chat.
// Local-only confirmation, like the user approval gate; not remote identity proof.
import crypto from 'crypto';
import { reviewContentVersion } from './publish-transaction.js';
export function finalReviewCode(packet) { return `ATLAS-REVIEW:${packet.finalReviewHash || packet.contentHash}:PASS`; }
export function finalReviewMatches(record, packet) {
  return record.finalReview?.contentHash === packet.finalReviewHash && record.finalReview?.imageCount === packet.images.length && record.finalReview?.verdict === 'PASS';
}
export function addFinalReviewGate(record, packet) {
  packet.finalReviewHash = crypto.createHash('sha256').update(JSON.stringify({ version: reviewContentVersion(record), images: packet.images.map((image) => [image.role, image.fingerprint, image.faceMatch]) })).digest('hex').slice(0, 32);
  packet.finalReviewReady = finalReviewMatches(record, packet);
  if (!packet.finalReviewReady) packet.blocking.push('최종 글·이미지 검수 묶음을 보내 검증받은 뒤 검수 완료 코드를 반영하세요.');
  return packet;
}
