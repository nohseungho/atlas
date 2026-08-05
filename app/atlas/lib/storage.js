"use client";

export const KEYS = {
  products: "atlas.products",
  blogDrafts: "atlas.blogDrafts",
  videoLibrary: "atlas.videoLibrary",
  publishingReady: "atlas.publishingReady",
  // 판매카드 작업 상태(프리셋·플랫폼·문구 수정본·이미지 배치). 상품 ID를 키로 쓴다.
  photoCards: "atlas.photoCards",
};

export function readList(key) {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function writeList(key, list) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(list));
}

export function readMap(key) {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function writeMap(key, map) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(map));
}

export function newId(prefix) {
  const random =
    typeof window !== "undefined" && window.crypto?.randomUUID
      ? window.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}_${random}`;
}
