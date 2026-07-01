import crypto from "crypto";
import fs from "fs";
import path from "path";
import { readJson, writeJson } from "@/lib/data-store";

const FILE = "tokens.json";
const ALGORITHM = "aes-256-gcm";

// tokens.json은 .gitignore 대상이라 저장소에 없을 수 있다. 없으면 빈 파일로 만든다.
function ensureFile() {
  const filePath = path.join(process.cwd(), "data", "atlas", FILE);
  if (!fs.existsSync(filePath)) {
    writeJson(FILE, { items: [] });
  }
}

function getEncryptionKey() {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("TOKEN_ENCRYPTION_KEY is not configured");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY must decode to 32 bytes (base64-encoded)");
  }
  return key;
}

function encryptPayload(payload) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf-8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return {
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

function decryptPayload(encrypted) {
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(encrypted.iv, "base64"));
  decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString("utf-8"));
}

function nextId(items) {
  const maxNum = items.reduce((max, item) => {
    const match = /^token_(\d+)$/.exec(item.id || "");
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `token_${String(maxNum + 1).padStart(3, "0")}`;
}

export function getTokenData() {
  ensureFile();
  return readJson(FILE);
}

export function saveTokenData(data) {
  writeJson(FILE, data);
}

// blogId + provider 기준으로 upsert. refreshToken이 없으면(재동의 없이 재발급된 경우)
// 기존에 저장된 refreshToken을 유지한다.
export function upsertTokenForBlog({ blogId, provider, accessToken, refreshToken, scope, expiresAt }) {
  const data = getTokenData();
  const now = new Date().toISOString();
  const existing = data.items.find((item) => item.blogId === blogId && item.provider === provider);

  const previousRefreshToken = existing ? decryptPayload(existing.encryptedPayload).refreshToken : null;

  const encryptedPayload = encryptPayload({
    accessToken,
    refreshToken: refreshToken || previousRefreshToken || null,
  });

  if (existing) {
    existing.encryptedPayload = encryptedPayload;
    existing.scope = scope || existing.scope;
    existing.expiresAt = expiresAt;
    existing.updatedAt = now;
    saveTokenData(data);
    return existing;
  }

  const record = {
    id: nextId(data.items),
    blogId,
    provider,
    scope: scope || "",
    expiresAt,
    encryptedPayload,
    createdAt: now,
    updatedAt: now,
  };

  data.items.push(record);
  saveTokenData(data);
  return record;
}

export function getTokenByBlogId(blogId) {
  return getTokenData().items.find((item) => item.blogId === blogId) || null;
}

// { accessToken, refreshToken }으로 복호화. auth 등 실제 API 호출 시에만 사용한다.
export function decryptToken(tokenRecord) {
  return decryptPayload(tokenRecord.encryptedPayload);
}
