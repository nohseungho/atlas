// One ordered document for review, dry-run and both publishers.
import { bodyParagraphsFromDraft, isHeadingLine, pickAnchorParagraphIndex, escapeHtml } from './naver-image-placement.js';
import { koreaLinkPlan } from './coupang-partners-status.js';
import { ATLAS_CHANNEL_ID, validateChannelIdentity } from './character-channel-policy.js';

export const DOCUMENT_VERSION = 1;
export function koreanStyleIssues(text = '') {
  const patterns = [/여기서 주장하지 않습니다/g, /단정할 수 없습니다/g, /재확인해야 합니다/g,
    /본 글에서는 순위를 정하지 않습니다/g, /후보를 고르면 확인해야 합니다/g,
    /(?:내부|캐릭터|발행|운영) 정책(?:을|에|상|이|은)/g, /(?:검수 결과|검수 기준|정책 위반|면책 문구)/g];
  return patterns.flatMap((pattern) => [...String(text).matchAll(pattern)].map(([match]) => `블로그 문체로 바꿔주세요: ${match}`));
}

export function createKoreaDocument(draft = {}) {
  const paragraphs = bodyParagraphsFromDraft(draft);
  const textBlocks = paragraphs.map((text, i) => ({ type: isHeadingLine(text) && !text.includes('\n') ? 'heading' : 'paragraph', id: `section-${i + 1}`, text }));
  const images = (draft.images || []).filter((image) => image.required !== false && image.optional !== true);
  const placements = images.map((image, index) => {
    const anchorIndex = image.anchorAfter
      ? textBlocks.findIndex((block) => block.id === image.anchorAfter)
      : pickAnchorParagraphIndex(paragraphs, image.anchorKeywords || []);
    return { type: 'image', id: `image-${image.id || index + 1}`, assetId: image.id || image.role || `asset-${index + 1}`,
      anchorAfter: anchorIndex < 0 ? '' : textBlocks[anchorIndex].id,
      src: image.src || '', alt: image.alt || '', role: image.role || '', characterId: image.characterId || 'suho' };
  });
  const blocks = textBlocks.flatMap((block) => [block, ...placements.filter((image) => image.anchorAfter === block.id)]);
  // Unresolved images remain visible to validation; never silently omit them.
  blocks.push(...placements.filter((image) => !image.anchorAfter));
  const link = koreaLinkPlan(draft);
  if (link.url) blocks.push({ type: 'paragraph', id: 'product-link', text: link.label, href: link.url });
  if (link.linkMode === 'affiliate' && link.disclosure) blocks.push({ type: 'paragraph', id: 'disclosure', text: link.disclosure });
  return { schemaVersion: DOCUMENT_VERSION, title: draft.title || '', articleId: draft.id || '', channel: 'korea', character: 'suho', blocks };
}

// Keep the existing Blogger layout assembler. Split its single result into
// lossless HTML fragments and addressable images; renderers never reparse prose.
export function createGlobalDocument(article, html) {
  const blocks = [];
  let offset = 0;
  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    blocks.push({ type: 'html', id: `fragment-${blocks.length}`, html: html.slice(offset, match.index) });
    const src = (/\bsrc="([^"]*)"/i.exec(match[0])?.[1] || '').replace(/&amp;/g, '&');
    const asset = (article.visualAssets || []).find((image) => [image.publicUrl, image.localSrc].includes(src));
    blocks.push({ type: 'image', id: `image-${blocks.length}`, assetId: asset?.key || src, anchorAfter: blocks.at(-1).id,
      src, publicUrl: asset?.publicUrl || (/^https:\/\//.test(src) ? src : ''), localSrc: asset?.localSrc || src,
      html: match[0], role: asset?.key || asset?.role || '', registered: Boolean(asset), alt: asset?.alt || '', characterId: asset?.characterId || 'miji' });
    offset = match.index + match[0].length;
  }
  blocks.push({ type: 'html', id: `fragment-${blocks.length}`, html: html.slice(offset) });
  return { schemaVersion: DOCUMENT_VERSION, title: article.title || '', articleId: article.id, channel: 'global', character: 'miji', blocks };
}

export function documentIssues(document, record = {}) {
  const issues = [];
  if (!document.title.trim()) issues.push('제목이 없습니다.');
  const identity = validateChannelIdentity(record, document.channel === 'korea' ? ATLAS_CHANNEL_ID.KOREA_NAVER : ATLAS_CHANNEL_ID.GLOBAL_BLOGGER);
  issues.push(...identity.issues);
  const ids = new Set();
  const assets = new Set();
  document.blocks.forEach((block, i) => {
    if (ids.has(block.id)) issues.push(`중복 block id: ${block.id}`);
    ids.add(block.id);
    if (block.type === 'image') {
      if (document.channel === 'global' && !block.registered) issues.push('본문 이미지가 검수 자산 목록에 없습니다. 모든 이미지를 등록하고 얼굴을 검수하세요.');
      if (!block.anchorAfter || document.blocks[i - 1]?.id !== block.anchorAfter) issues.push(`이미지 ${block.assetId}가 본문 anchor를 찾지 못했습니다.`);
      if (assets.has(block.assetId)) issues.push(`이미지 ${block.assetId}가 반복됩니다.`);
      assets.add(block.assetId);
      if (document.channel === 'korea' && document.blocks[i - 1]?.type === 'image') issues.push('연속 이미지가 발견됐습니다. 각 이미지의 본문 위치를 확인하세요.');
      if (block.characterId !== document.character && block.role !== 'product_photo') issues.push(`이미지 ${block.assetId}의 캐릭터 정책이 맞지 않습니다.`);
    }
    if (block.href && !/^https:\/\/[^\s]+$/i.test(block.href)) issues.push('제품 링크를 확인하세요.');
  });
  if (document.channel === 'korea') issues.push(...koreanStyleIssues(document.blocks.map((block) => block.text || '').join('\n')));
  return issues;
}

export function renderArticleDocument(document, { mode = 'preview', imageUrl } = {}) {
  return document.blocks.map((block) => {
    if (block.type === 'html') return block.html;
    if (block.type === 'image') {
      if (document.channel === 'global') {
        const src = mode === 'publish' ? block.publicUrl : block.localSrc || block.publicUrl;
        if (!src) return '';
        return block.html.replace(/\bsrc="[^"]*"/i, `src="${escapeHtml(src)}"`);
      }
      const src = imageUrl ? imageUrl(block) : block.src;
      return `<figure data-asset-id="${escapeHtml(block.assetId)}" data-anchor-after="${escapeHtml(block.anchorAfter)}" style="margin:20px auto;text-align:center"><img src="${escapeHtml(src)}" alt="${escapeHtml(block.alt)}" style="display:block;width:100%;max-width:720px;height:auto;margin:auto"></figure>`;
    }
    const text = escapeHtml(block.text).replace(/\n/g, '<br>');
    return block.type === 'heading'
      ? `<h2 id="${escapeHtml(block.id)}" style="text-align:center;font-size:19px">${text}</h2>`
      : `<p id="${escapeHtml(block.id)}" style="text-align:center">${block.href ? `<a href="${escapeHtml(block.href)}">${text}</a><br>${escapeHtml(block.href)}` : text}</p>`;
  }).join('');
}

const compact = (value) => String(value || '').replace(/[\s\u200b]+/g, '');
export function editorSequence(blocks) {
  const sequence = [];
  for (const block of blocks) {
    if (block.type === 'image') sequence.push({ type: 'image', ...(block.assetId ? { assetId: block.assetId } : {}) });
    else if (compact(block.text)) {
      if (sequence.at(-1)?.type === 'text') sequence.at(-1).text += compact(block.text);
      else sequence.push({ type: 'text', text: compact(block.text) });
    }
  }
  return sequence;
}

export function editorDocumentIssues(document, actualBlocks) {
  const expected = editorSequence(document.blocks);
  const actual = editorSequence(actualBlocks);
  const issues = [];
  if (expected.filter((block) => block.type === 'image').length !== actual.filter((block) => block.type === 'image').length) issues.push('편집기 이미지 개수가 미리보기와 다릅니다.');
  if (expected.length !== actual.length || expected.some((block, i) => block.type !== actual[i]?.type || (block.type === 'image' && actual[i]?.assetId && block.assetId !== actual[i].assetId))) issues.push('편집기 이미지 순서 또는 anchor 위치가 미리보기와 다릅니다.');
  if (expected.some((block, i) => block.type === 'text' && actual[i]?.type === 'text' && block.text !== actual[i].text)) issues.push('편집기 본문 내용 또는 글 입력 순서가 미리보기와 다릅니다.');
  if (actual.some((block, i) => block.type === 'image' && actual[i - 1]?.type === 'image')) issues.push('편집기에 연속 이미지가 발견됐습니다. 발행을 중단합니다.');
  return issues;
}
