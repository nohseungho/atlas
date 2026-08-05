"use client";

// ─── 상품 이미지 로컬 저장소 (IndexedDB) ───────────────────────────────────
// 이미지는 localStorage 용량(약 5MB)을 금방 넘기므로 IndexedDB에 따로 둔다.
// 상품 레코드(localStorage)와는 productId로만 연결한다. 새로고침해도 유지된다.

const DB_NAME = "atlas-photo-studio";
const DB_VERSION = 1;
const STORE = "productImages";

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("이 브라우저에서는 이미지 저장소를 쓸 수 없습니다."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("productId", "productId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("이미지 저장소를 열지 못했습니다."));
  });
}

function runTx(mode, handler) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const store = tx.objectStore(STORE);
        let result;
        try {
          result = handler(store);
        } catch (err) {
          reject(err);
          return;
        }
        // handler가 Promise를 돌려주면 resolve가 그 상태를 그대로 따라간다.
        tx.oncomplete = () => {
          db.close();
          resolve(result);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error || new Error("이미지 저장소 작업에 실패했습니다."));
        };
      }),
  );
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error("이미지를 읽지 못했습니다."));
    reader.readAsDataURL(file);
  });
}

export function loadImageElement(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("이미지를 불러오지 못했습니다."));
    img.src = dataUrl;
  });
}

export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 12 * 1024 * 1024;

/**
 * 업로드된 파일들을 상품에 붙여 저장한다.
 * @returns {Promise<{saved:object[], errors:string[]}>}
 */
export async function addImages(productId, fileList) {
  const files = Array.from(fileList || []);
  const saved = [];
  const errors = [];

  for (const file of files) {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      errors.push(`${file.name}: JPG·PNG·WebP만 등록할 수 있습니다.`);
      continue;
    }
    if (file.size > MAX_BYTES) {
      errors.push(`${file.name}: 12MB를 넘어 등록하지 않았습니다.`);
      continue;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const img = await loadImageElement(dataUrl);
      const record = {
        id: `img_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
        productId,
        name: file.name,
        type: file.type,
        size: file.size,
        width: img.naturalWidth,
        height: img.naturalHeight,
        dataUrl,
        createdAt: new Date().toISOString(),
      };
      await runTx("readwrite", (store) => store.put(record));
      saved.push(record);
    } catch (err) {
      errors.push(`${file.name}: ${err.message}`);
    }
  }

  return { saved, errors };
}

export async function listImages(productId) {
  const rows = await runTx("readonly", (store) => {
    const out = [];
    return new Promise((resolve, reject) => {
      const index = store.index("productId");
      const request = index.openCursor(IDBKeyRange.only(productId));
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          out.push(cursor.value);
          cursor.continue();
        } else resolve(out);
      };
      request.onerror = () => reject(request.error);
    });
  });
  return (rows || []).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

export async function countImages(productId) {
  return (await listImages(productId)).length;
}

export async function removeImage(id) {
  await runTx("readwrite", (store) => store.delete(id));
}

export async function removeImagesOfProduct(productId) {
  const images = await listImages(productId);
  for (const image of images) {
    await removeImage(image.id);
  }
}
