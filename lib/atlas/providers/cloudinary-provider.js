// Cloudinary Provider — server-only. Never import from a client component.
//
// Auth: the official SDK auto-configures itself from the CLOUDINARY_URL
// environment variable the moment `cloudinary` is required (no explicit
// secret handling in this file, no secret ever assigned to a variable we
// could accidentally log or return to a client).
import { v2 as cloudinary } from "cloudinary";
import fs from "fs";
import path from "path";

// Only files under public/images/articles/ may ever be uploaded. This is the
// same directory Visual Completion Sprint V1 copies article images into.
const ALLOWED_BASE_DIR = path.join(process.cwd(), "public", "images", "articles");

export function isCloudinaryConfigured() {
  return Boolean(process.env.CLOUDINARY_URL);
}

// Resolves a visualAssets[].localSrc (e.g. "/images/articles/travel-insurance/x.webp")
// to an absolute filesystem path, rejecting anything that isn't a real file
// strictly inside ALLOWED_BASE_DIR. Returns null (never throws) for any
// invalid, missing, or out-of-scope path — including "../" traversal, since
// path.resolve() normalizes ".." before the startsWith(base) check runs.
export function resolveLocalAssetFile(localSrc) {
  if (typeof localSrc !== "string" || !localSrc.startsWith("/images/articles/")) return null;
  const resolved = path.resolve(process.cwd(), "public", localSrc.replace(/^\//, ""));
  const normalizedBase = ALLOWED_BASE_DIR + path.sep;
  if (!resolved.startsWith(normalizedBase)) return null;
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) return null;
  return resolved;
}

// Uploads one article image. Fixed public_id (=asset key) + fixed folder
// (=article slug) + overwrite/invalidate makes re-running this idempotent —
// the same key always replaces the same Cloudinary asset, never stacks
// duplicates.
export async function uploadArticleImage({ slug, key, filePath }) {
  if (!isCloudinaryConfigured()) {
    const err = new Error("Cloudinary is not configured");
    err.code = "CLOUDINARY_CONFIG_MISSING";
    throw err;
  }
  const result = await cloudinary.uploader.upload(filePath, {
    resource_type: "image",
    folder: `atlas/articles/${slug}`,
    public_id: key,
    overwrite: true,
    invalidate: true,
  });
  if (!result.secure_url || !result.secure_url.startsWith("https://")) {
    const err = new Error("Cloudinary did not return a secure https URL");
    err.code = "CLOUDINARY_INSECURE_URL";
    throw err;
  }
  return { secureUrl: result.secure_url, width: result.width, height: result.height };
}
