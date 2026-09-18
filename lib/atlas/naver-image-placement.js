// 네이버 국내 글 본문 렌더링과 이미지 삽입 위치 계산.
// 브라우저(Playwright) 의존 없이 순수 로직만 두어 테스트 가능하게 유지한다.
// 원칙: 이미지는 반드시 "문단 전체" 뒤에만 들어가며 본문 텍스트는 절대 분할/수정하지 않는다.

export function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

export function isHeadingLine(line) {
  return line.length <= 45 && !/[.]$/.test(line) && !/[다요죠]$/.test(line);
}

// bodyText를 빈 줄 기준 블록(문단)으로 나눈다. 각 블록은 trim된 줄 배열.
export function bodyBlocksFromDraft(draft = {}) {
  return String(draft.bodyText || "")
    .replace(/\r/g, "")
    .split(/\n\s*\n/)
    .map((b) => b.split("\n").map((l) => l.trim()).filter(Boolean))
    .filter((b) => b.length);
}

function isSkippedBlock(draft, lines) {
  const skip = new Set([String(draft.title || "").trim(), String(draft.affiliateDisclosure || "").trim()]);
  return lines.length === 1 && (skip.has(lines[0]) || /^이 포스팅은 쿠팡 파트너스/.test(lines[0]) || /^제품 확인하기:/.test(lines[0]));
}

// 에디터에 실제로 들어가는 문단 텍스트 목록(순서 보장). 이미지 앵커 탐색과 dry-run에 쓴다.
export function bodyParagraphsFromDraft(draft = {}) {
  return bodyBlocksFromDraft(draft)
    .filter((lines) => !isSkippedBlock(draft, lines))
    .map((lines) => lines.join("\n"));
}

export function bodyHtmlFromDraft(draft = {}) {
  const center = "text-align:center;";
  const p = (inner, extra = "") => `<p style="${center}${extra}">${inner}</p>`;
  const emphasize = (line) => {
    let out = escapeHtml(line);
    const name = String(draft.productName || "").trim();
    if (name && line.includes(name)) out = out.replace(escapeHtml(name), `<b>${escapeHtml(name)}</b>`);
    return out;
  };
  const spacer = "<p><br></p>";
  const parts = [];
  const linkLine = draft.affiliateUrl ? p(`<a href="${escapeHtml(draft.affiliateUrl)}" target="_blank">${escapeHtml(draft.productName || draft.affiliateUrl)}</a>`) : "";
  let linkPlaced = false;
  for (const lines of bodyBlocksFromDraft(draft)) {
    if (isSkippedBlock(draft, lines)) continue;
    if (lines.length === 1 && /^\d+\.\s/.test(lines[0])) { parts.push(p(`<b>${escapeHtml(lines[0])}</b>`)); continue; }
    if (lines.length === 1 && isHeadingLine(lines[0])) { parts.push(spacer, p(`<b><span style="font-size:19px;">${escapeHtml(lines[0])}</span></b>`)); continue; }
    parts.push(p(lines.map(emphasize).join("<br>")), spacer);
    // 본문 중 "아래에서 확인" 안내 문단 바로 뒤에 링크를 자연스럽게 붙인다.
    if (linkLine && !linkPlaced && lines.some((l) => /아래에서 확인/.test(l))) { parts.push(linkLine, spacer); linkPlaced = true; }
  }
  if (linkLine && !linkPlaced) parts.push(p(`제품 정보는 아래에서 확인할 수 있습니다.`), linkLine);
  // 제휴 고지는 국내 확정 스타일에 따라 본문 최하단에 1회만 넣는다.
  if (draft.affiliateUrl && draft.affiliateDisclosure) parts.push(spacer, p(`<span style="font-size:13px;color:#6b7280;">${escapeHtml(draft.affiliateDisclosure)}</span>`));
  return parts.join("");
}

// 붙여넣기 실패 시 사용하는 plain text (고지는 최하단 1회).
export function bodyPlainTextFromDraft(draft = {}) {
  return [draft.bodyText || "", draft.affiliateUrl ? `제품 확인하기: ${draft.affiliateUrl}` : "", draft.affiliateUrl ? draft.affiliateDisclosure : ""]
    .filter(Boolean)
    .join("\n\n");
}

// 업로드 가능한 이미지: 로컬 파일 경로가 있고 실제로 존재하는 것만. 빈 src / 원격 URL은 skip.
export function usableImages(images = [], exists = () => true) {
  return (Array.isArray(images) ? images : []).filter((img) => {
    const src = String(img?.src || "").trim();
    return Boolean(src) && !/^https?:\/\//i.test(src) && exists(src);
  });
}

// anchorKeywords를 가장 많이 포함하는 "문단 전체"의 index. 없으면 -1.
// 키워드 문자열을 자르거나 바꾸지 않고 포함 여부만 본다.
export function pickAnchorParagraphIndex(paragraphs = [], keywords = []) {
  const cleaned = (Array.isArray(keywords) ? keywords : []).map((v) => String(v || "").trim()).filter(Boolean);
  if (!cleaned.length) return -1;
  let best = -1;
  let bestScore = 0;
  paragraphs.forEach((text, index) => {
    const score = cleaned.reduce((sum, keyword) => sum + (String(text || "").includes(keyword) ? 1 : 0), 0);
    if (score > bestScore) { bestScore = score; best = index; }
  });
  return best;
}

// 각 이미지가 어느 문단 "뒤"에 들어갈지 계산한다.
// anchor를 못 찾으면 마지막 문단 뒤(안전한 문단 끝), 문단이 없으면 skip.
export function planImagePlacements(paragraphs = [], images = [], exists = () => true) {
  return usableImages(images, exists).map((image) => {
    const anchorIndex = pickAnchorParagraphIndex(paragraphs, image.anchorKeywords || []);
    const matched = anchorIndex >= 0;
    const paragraphIndex = matched ? anchorIndex : paragraphs.length - 1;
    return {
      id: image.id || image.role || "",
      src: image.src,
      keywords: image.anchorKeywords || [],
      matched,
      paragraphIndex,
      skipped: paragraphIndex < 0,
    };
  });
}

// 문단 배열에 이미지를 "문단 뒤"에만 끼워 넣은 결과를 시뮬레이션한다.
// 문단 텍스트는 그대로 유지되며, 텍스트 노드는 절대 분할되지 않는다.
export function applyImagePlacements(paragraphs = [], placements = []) {
  const out = [];
  paragraphs.forEach((text, index) => {
    out.push({ type: "text", text });
    for (const placement of placements) {
      if (!placement.skipped && placement.paragraphIndex === index) out.push({ type: "image", id: placement.id });
    }
  });
  return out;
}

// 브라우저 안에서 실행: 문단 요소의 "끝"에 커서를 놓고, 실제로 끝인지 검증한다.
// 클릭+End 방식은 줄바꿈된 문단에서 시각적 줄 끝(단어 중간)에 멈추므로 쓰지 않는다.
export function caretToEndOfElement(el) {
  const doc = el.ownerDocument;
  const win = doc.defaultView;
  const editable = el.closest("[contenteditable='true']");
  if (editable && typeof editable.focus === "function") editable.focus();
  const sel = win.getSelection();
  if (!sel) return { ok: false, reason: "no_selection" };
  const range = doc.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
  if (!sel.focusNode || !el.contains(sel.focusNode)) return { ok: false, reason: "caret_outside" };
  const tail = doc.createRange();
  tail.setStart(sel.focusNode, sel.focusOffset);
  tail.setEnd(el, el.childNodes.length);
  const remaining = tail.toString().replace(/​/g, "").trim();
  return remaining ? { ok: false, reason: "caret_not_at_end", remaining } : { ok: true, text: (el.innerText || el.textContent || "").trim() };
}
