// ─── Photo Card · 색상/대비 유틸 ────────────────────────────────────────────
// 카드 위 텍스트가 배경에 묻히지 않도록 WCAG 상대휘도 기준으로 잉크색을 고른다.
// 브라우저 API를 쓰지 않으므로 node --test로 그대로 검증한다.

export function hexToRgb(hex) {
  const raw = String(hex || "").trim().replace(/^#/, "");
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

export function rgbToHex({ r, g, b }) {
  const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
  return `#${[r, g, b].map((n) => clamp(n).toString(16).padStart(2, "0")).join("")}`;
}

function channelLuminance(value) {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  return (
    0.2126 * channelLuminance(rgb.r) +
    0.7152 * channelLuminance(rgb.g) +
    0.0722 * channelLuminance(rgb.b)
  );
}

export function contrastRatio(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const light = Math.max(la, lb);
  const dark = Math.min(la, lb);
  return (light + 0.05) / (dark + 0.05);
}

/** 배경색 위에서 대비가 더 큰 잉크색(거의 검정/거의 흰색)을 고른다. */
export function pickInk(backgroundHex, { dark = "#111111", light = "#ffffff" } = {}) {
  return contrastRatio(backgroundHex, dark) >= contrastRatio(backgroundHex, light) ? dark : light;
}

/** 같은 색상에서 살짝 어둡게/밝게 (구분선·보조 텍스트용) */
export function mixHex(fromHex, toHex, ratio) {
  const a = hexToRgb(fromHex);
  const b = hexToRgb(toHex);
  if (!a || !b) return fromHex;
  const t = Math.max(0, Math.min(1, ratio));
  return rgbToHex({
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  });
}

/**
 * 이미지 위에 텍스트를 올릴 때 필요한 스크림(어두운 막) 불투명도.
 * 이미지 밝기를 알 수 없으므로 최악의 경우(흰 배경)를 가정하고 계산한다.
 */
export function scrimAlphaFor(inkHex, { minRatio = 4.5 } = {}) {
  // 흰색 이미지 위에 검은 스크림을 덮었을 때의 합성 밝기로 대비를 맞춘다.
  for (let alpha = 0; alpha <= 1.0001; alpha += 0.05) {
    const composed = rgbToHex({
      r: 255 * (1 - alpha),
      g: 255 * (1 - alpha),
      b: 255 * (1 - alpha),
    });
    if (contrastRatio(composed, inkHex) >= minRatio) return Number(alpha.toFixed(2));
  }
  return 1;
}
