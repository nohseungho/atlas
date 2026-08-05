// ─── Photo Card · 한글 줄바꿈 / 자동 축소 ───────────────────────────────────
// canvas measureText를 직접 부르지 않고 measure 함수를 주입받는다.
// 덕분에 렌더러 없이 node --test에서 줄바꿈 규칙만 따로 검증할 수 있다.

// 한글/한자/가나: 글자 단위로 끊어도 되는 구간
const CJK = /[ᄀ-ᇿ぀-ヿ㄰-㆏㐀-䶿一-鿿가-힯豈-﫿]/;
// 줄 첫머리에 오면 안 되는 문자(금칙 처리)
const NO_LINE_START = /[.,!?;:%)\]}>」』”’、。·…원％)】]/;
// 줄 끝에 오면 안 되는 문자
const NO_LINE_END = /[(\[{<「『“‘【]/;

/** 문자열을 줄바꿈 후보 토큰으로 자른다. 라틴 단어는 통째로, CJK는 글자 단위. */
export function tokenize(text) {
  const tokens = [];
  let buffer = "";

  const flush = () => {
    if (buffer) {
      tokens.push(buffer);
      buffer = "";
    }
  };

  for (const char of String(text ?? "")) {
    if (char === " ") {
      buffer += char;
      flush();
      continue;
    }
    if (CJK.test(char)) {
      flush();
      tokens.push(char);
      continue;
    }
    buffer += char;
  }
  flush();
  return tokens;
}

/**
 * maxWidth 안에 들어가도록 줄을 나눈다. \n은 강제 개행으로 존중한다.
 * @param {string} text
 * @param {number} maxWidth
 * @param {(s:string)=>number} measure 문자열 픽셀 폭
 */
export function wrapText(text, maxWidth, measure) {
  const paragraphs = String(text ?? "").split("\n");
  const lines = [];

  for (const paragraph of paragraphs) {
    const tokens = tokenize(paragraph);
    if (tokens.length === 0) {
      lines.push("");
      continue;
    }

    let current = "";
    for (const token of tokens) {
      const candidate = current + token;
      if (!current || measure(candidate.trimEnd()) <= maxWidth) {
        current = candidate;
        continue;
      }

      // 금칙 처리: 닫는 문장부호는 앞 줄에 붙여 보낸다.
      if (NO_LINE_START.test(token.trim()[0] || "")) {
        current = candidate;
        continue;
      }
      // 여는 괄호가 줄 끝에 남으면 다음 줄로 함께 내린다.
      let head = current.trimEnd();
      let carried = "";
      const lastChar = head[head.length - 1] || "";
      if (NO_LINE_END.test(lastChar) && head.length > 1) {
        carried = lastChar;
        head = head.slice(0, -1).trimEnd();
      }
      lines.push(head);
      current = carried + token.replace(/^ +/, "");
    }
    lines.push(current.trimEnd());
  }

  return lines;
}

function truncateLine(line, maxWidth, measure) {
  if (measure(line) <= maxWidth) return line;
  let cut = line;
  while (cut.length > 1 && measure(`${cut}…`) > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return `${cut.trimEnd()}…`;
}

/**
 * 폰트 크기를 줄여가며 maxLines/maxWidth 안에 넣는다.
 * 최소 크기에서도 넘치면 말줄임하고 overflow=true를 돌려준다(UI에서 경고 표시).
 * @param {(size:number)=>((s:string)=>number)} measureFactory 폰트 크기별 measure 생성기
 */
export function fitText(
  text,
  { maxWidth, maxLines = 3, maxFontSize = 64, minFontSize = 24, step = 2, measureFactory },
) {
  let fallback = null;
  for (let size = maxFontSize; size >= minFontSize; size -= step) {
    const measure = measureFactory(size);
    const lines = wrapText(text, maxWidth, measure);
    const tooWide = lines.some((line) => measure(line) > maxWidth);
    if (lines.length <= maxLines && !tooWide) {
      return { fontSize: size, lines, overflow: false };
    }
    fallback = { fontSize: size, lines, measure };
  }

  const measure = fallback?.measure || measureFactory(minFontSize);
  const all = wrapText(text, maxWidth, measure);
  const lines = all.slice(0, maxLines).map((line) => truncateLine(line, maxWidth, measure));
  // 뒤쪽 줄이 잘려나갔다면 마지막 줄에 말줄임을 남겨 잘림을 드러낸다.
  if (all.length > maxLines && lines.length) {
    const last = lines[lines.length - 1];
    lines[lines.length - 1] = last.endsWith("…")
      ? last
      : truncateLine(`${last.trimEnd()}…`, maxWidth, measure);
  }
  return { fontSize: minFontSize, lines, overflow: true };
}
