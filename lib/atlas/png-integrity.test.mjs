import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pngIntegrityIssue } from './png-integrity.js';
import { koreaReviewPacket } from './operate/publish-approval-store.js';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAX+XDSwAAAABJRU5ErkJggg==', 'base64');

test('complete PNG passes; truncated chunk, missing end and corrupt CRC fail', () => {
  assert.equal(pngIntegrityIssue(png), '');
  for (const end of [4, 16, 45, png.length - 2, png.length - 12]) assert.match(pngIntegrityIssue(png.subarray(0, end)), /손상/);
  const corrupt = Buffer.from(png); corrupt[45] ^= 255;
  assert.match(pngIntegrityIssue(corrupt), /손상/);
  const invalidStreamWithValidCrc = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAE0lEQVRpbnZhbGlkIHpsaWIgc3RyZWFtXdId3AAAAABJRU5ErkJggg==', 'base64');
  assert.match(pngIntegrityIssue(invalidStreamWithValidCrc), /손상/);
  assert.equal(pngIntegrityIssue(Buffer.concat([png, Buffer.from('delivery metadata')])), '');
});

test('existing but damaged PNG is unready in the actual review packet and changes its reviewed hash', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-png-review-'));
  try {
    const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/bedding-review.json', import.meta.url)));
    fixture.id = 'integrity-test-only';
    fixture.images.forEach((image, index) => {
      image.src = path.join(root, `${index}.png`);
      fs.writeFileSync(image.src, Buffer.concat([png, Buffer.from([index])]));
    });
    const good = koreaReviewPacket(fixture);
    assert.equal(good.images.every((image) => image.ready), true);
    fs.writeFileSync(fixture.images[0].src, png.subarray(0, 45));
    const damaged = koreaReviewPacket(fixture);
    assert.equal(damaged.images[0].ready, false);
    assert.ok(damaged.blocking.some((issue) => issue.includes('PNG 이미지 데이터가 손상')));
    assert.notEqual(damaged.contentHash, good.contentHash);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
