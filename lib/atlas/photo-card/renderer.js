// ─── Photo Card · 1080×1920 캔버스 렌더러 ──────────────────────────────────
// 미리보기와 다운로드가 100% 같은 결과가 되도록, 화면에 보여주는 캔버스에서
// 그대로 toBlob()을 호출한다(별도 렌더 경로를 두지 않는다).
// 이미지 비율은 어떤 경우에도 변형하지 않는다.

import { contrastRatio, mixHex, scrimAlphaFor } from "./color.js";
import { fitText } from "./text-layout.js";
import { CARD_HEIGHT, CARD_WIDTH, FONT_STACK, KIND_EMPHASIS, SAFE_MARGIN } from "./presets.js";

export const DEFAULT_IMAGE_SETTINGS = {
  fit: "contain",
  scale: 1,
  focusX: 0.5,
  focusY: 0.5,
  background: "blur", // "blur" | "color"
  backgroundColor: "#f2f3f5",
};

/** 확대 배율이 이 값을 넘으면 화질 경고를 띄운다. */
export const UPSCALE_WARNING = 1.15;

/**
 * 이미지 배치 계산. 비율을 유지한 채 box 안에 넣는다(왜곡 없음).
 * 순수 함수라 캔버스 없이 검증할 수 있다.
 */
export function computeImageDraw(imgW, imgH, box, settings = {}) {
  const { fit = "contain", scale = 1, focusX = 0.5, focusY = 0.5 } = settings;
  if (!imgW || !imgH || !box?.w || !box?.h) return null;

  const base =
    fit === "cover"
      ? Math.max(box.w / imgW, box.h / imgH)
      : Math.min(box.w / imgW, box.h / imgH);
  const s = base * (Number.isFinite(scale) && scale > 0 ? scale : 1);

  const dw = imgW * s;
  const dh = imgH * s;
  const clampUnit = (v) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0.5));

  return {
    dx: box.x + (box.w - dw) * clampUnit(focusX),
    dy: box.y + (box.h - dh) * clampUnit(focusY),
    dw,
    dh,
    upscale: s,
    // 원본 비율 대비 그려지는 비율 (검증용, 항상 1)
    aspectRatio: dw / dh / (imgW / imgH),
  };
}

function roundRectPath(ctx, x, y, w, h, radii) {
  const r = Array.isArray(radii) ? radii : [radii, radii, radii, radii];
  const [tl, tr, br, bl] = r.map((v) => Math.max(0, Math.min(v, Math.min(w, h) / 2)));
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  ctx.arcTo(x + w, y, x + w, y + tr, tr);
  ctx.lineTo(x + w, y + h - br);
  ctx.arcTo(x + w, y + h, x + w - br, y + h, br);
  ctx.lineTo(x + bl, y + h);
  ctx.arcTo(x, y + h, x, y + h - bl, bl);
  ctx.lineTo(x, y + tl);
  ctx.arcTo(x, y, x + tl, y, tl);
  ctx.closePath();
}

function measurer(ctx, weight) {
  return (size) => (text) => {
    ctx.font = `${weight} ${size}px ${FONT_STACK}`;
    return ctx.measureText(text).width;
  };
}

/**
 * 블록 목록을 세로로 쌓아 배치한다. 넘치면 전체 배율을 낮춰 다시 계산한다.
 * @returns {{blocks:Array, height:number, overflow:boolean, ratio:number}}
 */
function layoutStack(ctx, blocks, { width, height }) {
  for (let ratio = 1; ratio >= 0.6; ratio -= 0.05) {
    const measured = [];
    let total = 0;
    let overflow = false;

    for (const block of blocks) {
      const gap = (block.gapBefore || 0) * ratio;
      if (block.type === "divider") {
        measured.push({ ...block, gap, lines: [], fontSize: 0, blockHeight: 2 });
        total += gap + 2;
        continue;
      }

      const maxFontSize = Math.round((block.maxFontSize || 48) * ratio);
      const minFontSize = Math.max(20, Math.round((block.minFontSize || 28) * ratio));
      const measureFactory = measurer(ctx, block.weight || 400);

      if (block.type === "bullets") {
        const marker = block.marker || "•";
        ctx.font = `${block.weight || 400} ${maxFontSize}px ${FONT_STACK}`;
        const markerWidth = ctx.measureText(`${marker} `).width;
        const items = [];
        let blockHeight = 0;
        (block.items || []).forEach((item, i) => {
          const fitted = fitText(item, {
            maxWidth: width - markerWidth,
            maxLines: block.maxLinesPerItem || 3,
            maxFontSize,
            minFontSize,
            step: 2,
            measureFactory,
          });
          const lineHeight = fitted.fontSize * (block.lineHeight || 1.42);
          const itemGap = i === 0 ? 0 : (block.itemGap || 18) * ratio;
          items.push({ ...fitted, lineHeight, markerWidth, itemGap });
          blockHeight += itemGap + fitted.lines.length * lineHeight;
          if (fitted.overflow) overflow = true;
        });
        measured.push({ ...block, gap, items, blockHeight });
        total += gap + blockHeight;
        continue;
      }

      const fitted = fitText(block.text || "", {
        maxWidth: width,
        maxLines: block.maxLines || 3,
        maxFontSize,
        minFontSize,
        step: 2,
        measureFactory,
      });
      if (fitted.overflow) overflow = true;
      const lineHeight = fitted.fontSize * (block.lineHeight || 1.3);
      // 배지는 알약 배경(상하 패딩 0.42em)을 포함한 높이로 잡는다.
      const blockHeight =
        block.type === "badge" ? fitted.fontSize * 1.84 : fitted.lines.length * lineHeight;
      measured.push({ ...block, gap, ...fitted, lineHeight, blockHeight });
      total += gap + blockHeight;
    }

    if (total <= height) return { blocks: measured, height: total, overflow, ratio };
    if (ratio <= 0.6001) return { blocks: measured, height: total, overflow: true, ratio };
  }
  return { blocks: [], height: 0, overflow: true, ratio: 0.6 };
}

function drawStack(ctx, layout, { x, y, width, align, palette }) {
  let cursor = y;
  const alignX = align === "center" ? x + width / 2 : x;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = align === "center" ? "center" : "left";

  for (const block of layout.blocks) {
    cursor += block.gap;

    if (block.type === "divider") {
      ctx.strokeStyle = block.color || palette.line;
      ctx.lineWidth = 2;
      ctx.beginPath();
      const lineY = cursor + 1;
      if (align === "center") {
        ctx.moveTo(x + width / 2 - 90, lineY);
        ctx.lineTo(x + width / 2 + 90, lineY);
      } else {
        ctx.moveTo(x, lineY);
        ctx.lineTo(x + width, lineY);
      }
      ctx.stroke();
      cursor += 2;
      continue;
    }

    if (block.type === "badge") {
      const text = block.lines.join(" ");
      ctx.font = `700 ${block.fontSize}px ${FONT_STACK}`;
      const padX = Math.round(block.fontSize * 0.62);
      const padY = Math.round(block.fontSize * 0.42);
      const textWidth = ctx.measureText(text).width;
      const boxW = textWidth + padX * 2;
      const boxH = block.fontSize + padY * 2;
      const boxX = align === "center" ? x + width / 2 - boxW / 2 : x;
      if (block.filled === false) {
        ctx.strokeStyle = block.color || palette.accent;
        ctx.lineWidth = 3;
        roundRectPath(ctx, boxX, cursor, boxW, boxH, boxH / 2);
        ctx.stroke();
        ctx.fillStyle = block.color || palette.accent;
      } else {
        ctx.fillStyle = block.background || palette.accent;
        roundRectPath(ctx, boxX, cursor, boxW, boxH, boxH / 2);
        ctx.fill();
        ctx.fillStyle = block.color || palette.accentInk;
      }
      ctx.fillText(text, align === "center" ? x + width / 2 : boxX + padX, cursor + padY + block.fontSize * 0.8);
      cursor += boxH;
      continue;
    }

    if (block.type === "bullets") {
      // 마커와 본문을 한 덩어리로 보고 시작 x를 직접 계산한다.
      // (textAlign=center로 그리면 마커가 문장 한가운데 찍힌다.)
      ctx.textAlign = "left";
      for (const item of block.items) {
        cursor += item.itemGap;
        ctx.font = `${block.weight || 400} ${item.fontSize}px ${FONT_STACK}`;
        item.lines.forEach((line, i) => {
          const baseline = cursor + item.lineHeight * i + item.fontSize * 0.82;
          const lineWidth = ctx.measureText(line).width;
          const startX =
            align === "center" ? alignX - (item.markerWidth + lineWidth) / 2 : x;
          if (i === 0) {
            ctx.fillStyle = block.markerColor || palette.accent;
            ctx.fillText(block.marker || "•", startX, baseline);
          }
          ctx.fillStyle = block.color || palette.ink;
          ctx.fillText(line, startX + item.markerWidth, baseline);
        });
        cursor += item.lines.length * item.lineHeight;
      }
      ctx.textAlign = align === "center" ? "center" : "left";
      continue;
    }

    ctx.font = `${block.weight || 400} ${block.fontSize}px ${FONT_STACK}`;
    ctx.fillStyle = block.color || palette.ink;
    block.lines.forEach((line, i) => {
      ctx.fillText(line, alignX, cursor + block.lineHeight * i + block.fontSize * 0.82);
    });
    cursor += block.lines.length * block.lineHeight;
  }

  return cursor;
}

function averageColor(image) {
  try {
    const c = document.createElement("canvas");
    c.width = 8;
    c.height = 8;
    const cx = c.getContext("2d", { willReadFrequently: true });
    cx.drawImage(image, 0, 0, 8, 8);
    const { data } = cx.getImageData(0, 0, 8, 8);
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 16) continue; // 투명 배경 픽셀은 평균에서 제외
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      n += 1;
    }
    if (!n) return null;
    return `rgb(${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)})`;
  } catch {
    return null;
  }
}

/** 이미지 영역의 빈 공간을 블러 배경 또는 지정 색으로 채운다. */
function drawBackdrop(ctx, image, box, settings, palette) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.w, box.h);
  ctx.clip();

  if (settings.background === "color" || !image) {
    ctx.fillStyle = settings.backgroundColor || palette.canvas;
    ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.restore();
    return;
  }

  const fallback = averageColor(image) || settings.backgroundColor || palette.canvas;
  ctx.fillStyle = fallback;
  ctx.fillRect(box.x, box.y, box.w, box.h);

  const cover = computeImageDraw(image.naturalWidth || image.width, image.naturalHeight || image.height, box, {
    fit: "cover",
    scale: 1.25,
    focusX: 0.5,
    focusY: 0.5,
  });
  if (cover) {
    const supportsFilter = typeof ctx.filter === "string";
    if (supportsFilter) ctx.filter = "blur(46px) saturate(120%)";
    ctx.globalAlpha = supportsFilter ? 0.95 : 0.35;
    ctx.drawImage(image, cover.dx, cover.dy, cover.dw, cover.dh);
    if (supportsFilter) ctx.filter = "none";
    ctx.globalAlpha = 1;
  }

  // 블러 배경 위 제품이 뜨도록 아주 옅은 막을 한 겹 올린다.
  ctx.fillStyle = "rgba(255,255,255,0.10)";
  ctx.fillRect(box.x, box.y, box.w, box.h);
  ctx.restore();
}

function drawProductImage(ctx, image, box, settings, palette, warnings) {
  drawBackdrop(ctx, image, box, settings, palette);
  if (!image) {
    ctx.save();
    ctx.fillStyle = mixHex("#888888", "#ffffff", 0.2);
    ctx.font = `600 44px ${FONT_STACK}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("상품 이미지 없음", box.x + box.w / 2, box.y + box.h / 2);
    ctx.restore();
    warnings.push("상품 이미지가 없어 자리표시자만 그렸습니다.");
    return;
  }

  const imgW = image.naturalWidth || image.width;
  const imgH = image.naturalHeight || image.height;
  const draw = computeImageDraw(imgW, imgH, box, settings);
  if (!draw) return;

  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.w, box.h);
  ctx.clip();
  ctx.drawImage(image, draw.dx, draw.dy, draw.dw, draw.dh);
  ctx.restore();

  if (draw.upscale > UPSCALE_WARNING) {
    warnings.push(
      `원본 ${imgW}×${imgH}px를 ${Math.round(draw.upscale * 100)}%로 확대했습니다. 화질 저하 가능.`,
    );
  }
}

function buildBlocks(card, preset, options) {
  const emphasis = KIND_EMPHASIS[card.kind] || KIND_EMPHASIS.cover;
  const { palette } = preset;
  const blocks = [];

  if (card.badge) {
    blocks.push({
      type: "badge",
      text: card.badge,
      maxFontSize: 34,
      minFontSize: 24,
      maxLines: 1,
      weight: 700,
      ...(options.badgeStyle || {}),
    });
  }
  if (card.headline) {
    blocks.push({
      type: "headline",
      text: card.headline,
      maxFontSize: emphasis.headlineMax,
      minFontSize: 40,
      maxLines: emphasis.headlineLines,
      weight: 800,
      lineHeight: 1.24,
      gapBefore: 30,
      color: options.headlineColor || palette.ink,
    });
  }
  if (card.sub) {
    blocks.push({
      type: "sub",
      text: card.sub,
      maxFontSize: 42,
      minFontSize: 28,
      maxLines: 2,
      weight: 500,
      lineHeight: 1.35,
      gapBefore: 20,
      color: options.subColor || palette.muted,
    });
  }
  if (card.bullets?.length) {
    blocks.push({ type: "divider", gapBefore: 34, color: palette.line });
    blocks.push({
      type: "bullets",
      items: card.bullets,
      marker: options.marker || "•",
      maxFontSize: 40,
      minFontSize: 26,
      maxLinesPerItem: 3,
      itemGap: 20,
      weight: 500,
      lineHeight: 1.4,
      gapBefore: 34,
      color: options.bulletColor || palette.ink,
      markerColor: palette.accent,
    });
  }
  return blocks;
}

function drawFootnote(ctx, card, preset, { x, y, width, align, color }) {
  if (!card.footnote) return 0;
  const layout = layoutStack(
    ctx,
    [
      {
        type: "footnote",
        text: card.footnote,
        maxFontSize: 26,
        minFontSize: 20,
        maxLines: 3,
        weight: 500,
        lineHeight: 1.4,
      },
    ],
    { width, height: 200 },
  );
  drawStack(ctx, layout, { x, y, width, align, palette: { ...preset.palette, ink: color } });
  return layout.height;
}

// ── 프리셋별 구조 ──────────────────────────────────────────────────────────

function renderClean(ctx, { card, preset, image, imageSettings, warnings }) {
  const { palette } = preset;
  ctx.fillStyle = palette.canvas;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  drawProductImage(ctx, image, preset.imageBox, imageSettings, palette, warnings);

  ctx.save();
  roundRectPath(ctx, preset.panelBox.x - 4, preset.panelBox.y, preset.panelBox.w + 8, preset.panelBox.h, [
    56, 56, 0, 0,
  ]);
  ctx.fillStyle = palette.panel;
  ctx.fill();
  ctx.restore();

  const box = preset.textBox;
  const footHeight = card.footnote ? 110 : 0;
  const blocks = buildBlocks(card, preset, { marker: "•" });
  const layout = layoutStack(ctx, blocks, { width: box.w, height: box.h - footHeight });
  drawStack(ctx, layout, { x: box.x, y: box.y, width: box.w, align: "left", palette });

  if (card.footnote) {
    drawFootnote(ctx, card, preset, {
      x: box.x,
      y: box.y + box.h - footHeight + 20,
      width: box.w,
      align: "left",
      color: palette.muted,
    });
  }

  // 대비 확인: 패널 위 본문 잉크
  if (contrastRatio(palette.panel, palette.ink) < 4.5) {
    warnings.push("본문 대비가 낮습니다.");
  }
  return layout.overflow;
}

function renderDeal(ctx, { card, preset, image, imageSettings, warnings }) {
  const { palette } = preset;
  ctx.fillStyle = palette.canvas;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // 상단 대각 밴드
  ctx.save();
  ctx.fillStyle = palette.accent;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(CARD_WIDTH, 0);
  ctx.lineTo(CARD_WIDTH, preset.topBandBox.h - 60);
  ctx.lineTo(0, preset.topBandBox.h);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  const bandBox = { x: SAFE_MARGIN, y: 60, w: CARD_WIDTH - SAFE_MARGIN * 2, h: 300 };
  const bandLayout = layoutStack(
    ctx,
    [
      card.badge
        ? {
            type: "badge",
            text: card.badge,
            maxFontSize: 32,
            minFontSize: 24,
            maxLines: 1,
            weight: 800,
            background: palette.accentInk,
            color: palette.accent,
          }
        : null,
      {
        type: "headline",
        text: card.headline || "",
        maxFontSize: (KIND_EMPHASIS[card.kind] || KIND_EMPHASIS.cover).headlineMax,
        minFontSize: 40,
        maxLines: 2,
        weight: 900,
        lineHeight: 1.18,
        gapBefore: 24,
        color: palette.accentInk,
      },
    ].filter(Boolean),
    { width: bandBox.w, height: bandBox.h },
  );
  drawStack(ctx, bandLayout, {
    x: bandBox.x,
    y: bandBox.y,
    width: bandBox.w,
    align: "center",
    palette,
  });

  // 중앙 정사각 프레임 + 이미지
  ctx.save();
  roundRectPath(ctx, preset.imageBox.x, preset.imageBox.y, preset.imageBox.w, preset.imageBox.h, 32);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();
  const innerBox = {
    x: preset.imageBox.x + 18,
    y: preset.imageBox.y + 18,
    w: preset.imageBox.w - 36,
    h: preset.imageBox.h - 36,
  };
  drawProductImage(ctx, image, innerBox, imageSettings, palette, warnings);
  ctx.save();
  roundRectPath(ctx, preset.imageBox.x, preset.imageBox.y, preset.imageBox.w, preset.imageBox.h, 32);
  ctx.strokeStyle = palette.accent;
  ctx.lineWidth = 8;
  ctx.stroke();
  ctx.restore();

  // 하단 다크 블록
  ctx.fillStyle = palette.panel;
  ctx.fillRect(preset.bottomBox.x, preset.bottomBox.y, preset.bottomBox.w, preset.bottomBox.h);

  const box = preset.textBox;
  const footHeight = card.footnote ? 120 : 0;
  const bottomBlocks = [];
  if (card.sub) {
    bottomBlocks.push({
      type: "sub",
      text: card.sub,
      maxFontSize: 38,
      minFontSize: 26,
      maxLines: 2,
      weight: 600,
      lineHeight: 1.3,
      color: palette.muted,
    });
  }
  if (card.bullets?.length) {
    bottomBlocks.push({
      type: "bullets",
      items: card.bullets,
      marker: "▸",
      maxFontSize: 38,
      minFontSize: 24,
      maxLinesPerItem: 2,
      itemGap: 16,
      weight: 600,
      lineHeight: 1.36,
      gapBefore: 26,
      color: palette.ink,
      markerColor: palette.accent,
    });
  }
  const layout = layoutStack(ctx, bottomBlocks, { width: box.w, height: box.h - footHeight });
  drawStack(ctx, layout, { x: box.x, y: box.y, width: box.w, align: "center", palette });

  if (card.footnote) {
    drawFootnote(ctx, card, preset, {
      x: box.x,
      y: box.y + box.h - footHeight + 26,
      width: box.w,
      align: "center",
      color: palette.muted,
    });
  }

  if (contrastRatio(palette.accent, palette.accentInk) < 4.5) {
    warnings.push("상단 밴드 대비가 낮습니다.");
  }
  return layout.overflow || bandLayout.overflow;
}

function renderLifestyle(ctx, { card, preset, image, imageSettings, warnings }) {
  const { palette } = preset;
  ctx.fillStyle = palette.canvas;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  drawProductImage(ctx, image, preset.imageBox, imageSettings, palette, warnings);

  // 하단 그라디언트 스크림 (텍스트 대비 보장)
  const needed = scrimAlphaFor(palette.ink, { minRatio: 4.5 });
  const alpha = Math.max(preset.scrim.alpha, needed);
  const gradient = ctx.createLinearGradient(0, preset.scrim.from, 0, preset.scrim.to);
  gradient.addColorStop(0, "rgba(8,10,12,0)");
  gradient.addColorStop(0.42, `rgba(8,10,12,${(alpha * 0.75).toFixed(2)})`);
  gradient.addColorStop(1, `rgba(8,10,12,${alpha.toFixed(2)})`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, preset.scrim.from, CARD_WIDTH, preset.scrim.to - preset.scrim.from);

  const topGradient = ctx.createLinearGradient(0, 0, 0, 320);
  topGradient.addColorStop(0, "rgba(8,10,12,0.55)");
  topGradient.addColorStop(1, "rgba(8,10,12,0)");
  ctx.fillStyle = topGradient;
  ctx.fillRect(0, 0, CARD_WIDTH, 320);

  const box = preset.textBox;
  const footHeight = card.footnote ? 110 : 0;
  const blocks = buildBlocks(card, preset, {
    marker: "—",
    badgeStyle: { filled: false, color: palette.accent },
    bulletColor: palette.muted,
  });
  const layout = layoutStack(ctx, blocks, { width: box.w, height: box.h - footHeight });

  // 텍스트를 하단 정렬한다(전면 이미지 구조의 핵심 차이)
  const startY = box.y + (box.h - footHeight - layout.height);

  // 좌측 세로 악센트
  ctx.fillStyle = palette.accent;
  ctx.fillRect(SAFE_MARGIN, startY + 6, 8, Math.max(120, layout.height - 12));

  drawStack(ctx, layout, { x: box.x, y: startY, width: box.w, align: "left", palette });

  if (card.footnote) {
    drawFootnote(ctx, card, preset, {
      x: box.x,
      y: CARD_HEIGHT - SAFE_MARGIN - footHeight + 40,
      width: box.w,
      align: "left",
      color: palette.muted,
    });
  }

  if (contrastRatio("#080a0c", palette.ink) < 4.5) {
    warnings.push("오버레이 대비가 낮습니다.");
  }
  return layout.overflow;
}

const RENDERERS = {
  "image-top-panel-bottom": renderClean,
  "band-top-image-mid-dark-bottom": renderDeal,
  "full-bleed-overlay": renderLifestyle,
};

/**
 * 카드 1장을 캔버스에 그린다. 캔버스는 항상 정확히 1080×1920으로 맞춘다.
 * @returns {{warnings:string[], overflow:boolean}}
 */
export function renderCardToCanvas(canvas, { card, preset, image, imageSettings }) {
  const warnings = [];
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  ctx.textRendering = "optimizeLegibility";

  const settings = { ...DEFAULT_IMAGE_SETTINGS, fit: preset.defaultFit, ...(imageSettings || {}) };
  const render = RENDERERS[preset.structure] || renderClean;
  const overflow = render(ctx, { card, preset, image, imageSettings: settings, warnings });

  if (overflow) warnings.push(`"${card.label}" 카드 문구가 길어 최소 크기로 축소·말줄임했습니다.`);
  return { warnings, overflow: Boolean(overflow) };
}

export function canvasToPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("PNG 변환에 실패했습니다."));
    }, "image/png");
  });
}
