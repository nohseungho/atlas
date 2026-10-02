import fs from 'fs';
import crypto from 'crypto';
import path from 'path';
import { faceMatchPassed } from './face-match.js';
import { ATLAS_CHARACTERS } from './character-channel-policy.js';

export function fileDigest(file) {
  try { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
  catch { return ''; }
}

// A score belongs to the exact image and exact policy master evaluated by ArcFace.
export function faceProofPassed(record, file) {
  const master = ATLAS_CHARACTERS.miji.masterAssetPath;
  return faceMatchPassed(record) && record.faces === 1 && record.method === 'arcface_buffalo_l'
    && record.reference?.replaceAll('\\', '/') === master
    && Boolean(record.imageHash && record.referenceHash)
    && record.imageHash === fileDigest(file)
    && record.referenceHash === fileDigest(path.join(process.cwd(), master));
}
