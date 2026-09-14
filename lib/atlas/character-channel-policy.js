// ATLAS character/channel policy is the single source of truth for every
// content path.  Keep identity, master assets and storage namespaces here so
// Blogger and Naver can never silently borrow each other's assets.

export const ATLAS_CHANNEL_ID = Object.freeze({
  GLOBAL_BLOGGER: "global_blogger",
  KOREA_NAVER: "korea_naver",
});

export const ATLAS_CHARACTERS = Object.freeze({
  miji: Object.freeze({
    id: "miji",
    displayName: "미지",
    masterFileName: "ATLAS-MIJI-MASTER.png",
    masterAssetPath: "public/atlas/characters/ATLAS-MIJI-MASTER.png",
    visualMode: "natural-review-photo",
    identityPrompt:
      "Miji, the same Korean woman in her 30s shown in the identity reference: long dark-brown wavy hair, warm brown almond-shaped eyes, oval face, soft jawline",
  }),
  suho: Object.freeze({
    id: "suho",
    displayName: "수호",
    masterFileName: "ATLAS-SUO-MASTER.png",
    masterAssetPath: "public/atlas/characters/ATLAS-SUO-MASTER.png",
    visualMode: "warm-practical-illustration",
    styleReferenceAssetPath: "public/atlas/korea/suho/multitap/featured.png",
    identityPrompt: "Suho, the exact same Korean male presenter shown in the identity reference",
  }),
});

export const ATLAS_CHANNELS = Object.freeze({
  [ATLAS_CHANNEL_ID.GLOBAL_BLOGGER]: Object.freeze({
    id: ATLAS_CHANNEL_ID.GLOBAL_BLOGGER,
    platform: "blogger",
    language: "en",
    characterId: "miji",
    assetScope: "global",
    assetNamespace: "atlas/articles",
  }),
  [ATLAS_CHANNEL_ID.KOREA_NAVER]: Object.freeze({
    id: ATLAS_CHANNEL_ID.KOREA_NAVER,
    platform: "naver",
    language: "ko",
    blogId: "who-ami",
    characterId: "suho",
    assetScope: "korea",
    assetNamespace: ".atlas-data/korea-assets",
  }),
});

export const PROTECTED_NAVER_POSTS = Object.freeze(["224407589323"]);
export const CHARACTER_POLICY_VERSION = "ATLAS_CHARACTER_CHANNEL_V1";

const PERSON_SCENE = /miji|woman|travell?er|person|requester|presenter|portrait|featured|hero|editorial|lifestyle|airport|packing|planning|checking/i;

function clean(value) {
  return String(value || "").trim();
}

export function getChannelPolicy(channelId) {
  const policy = ATLAS_CHANNELS[channelId];
  if (!policy) throw new Error(`Unknown ATLAS channel: ${channelId}`);
  return policy;
}

export function getCharacterDefinition(characterId) {
  const character = ATLAS_CHARACTERS[characterId];
  if (!character) throw new Error(`Unknown ATLAS character: ${characterId}`);
  return character;
}

export function stampChannelIdentity(record = {}, channelId) {
  const channel = getChannelPolicy(channelId);
  const character = getCharacterDefinition(channel.characterId);
  return {
    ...record,
    channelId: channel.id,
    assetScope: channel.assetScope,
    assetNamespace: channel.assetNamespace,
    character: character.id,
    heroCharacterId: character.id,
    masterFileName: character.masterFileName,
    masterAssetPath: character.masterAssetPath,
    visualMode: character.visualMode,
    ...(character.styleReferenceAssetPath ? { styleReferenceAssetPath: character.styleReferenceAssetPath } : {}),
    characterPolicyVersion: CHARACTER_POLICY_VERSION,
    ...(channel.blogId ? { blogId: channel.blogId } : {}),
  };
}

export function bindVisualAssetsToChannel(visualAssets = [], channelId) {
  const channel = getChannelPolicy(channelId);
  const character = getCharacterDefinition(channel.characterId);
  return (Array.isArray(visualAssets) ? visualAssets : []).map((asset) => {
    const originalPrompt = clean(asset?.prompt);
    const characterRequired = channel.id === ATLAS_CHANNEL_ID.GLOBAL_BLOGGER && (
      asset?.characterRequired === true || PERSON_SCENE.test(`${asset?.key || ""} ${asset?.role || ""} ${asset?.alt || ""} ${originalPrompt}`)
    );
    const prompt = characterRequired && !originalPrompt.includes("Identity lock:")
      ? `${originalPrompt}\n\nIdentity lock: ${character.identityPrompt}. Use the attached ATLAS master only as the identity reference. Preserve her facial identity. Do not substitute another presenter. No text, logo or watermark.`
      : originalPrompt;
    return {
      ...asset,
      prompt,
      channelId: channel.id,
      assetScope: channel.assetScope,
      assetNamespace: channel.assetNamespace,
      characterId: character.id,
      masterAssetPath: character.masterAssetPath,
      characterRequired,
    };
  });
}

export function validateChannelIdentity(record = {}, channelId) {
  const channel = getChannelPolicy(channelId);
  const character = getCharacterDefinition(channel.characterId);
  const issues = [];
  const suppliedCharacter = clean(record.character || record.heroCharacterId);
  if (suppliedCharacter && suppliedCharacter !== character.id) issues.push(`character must be ${character.id}`);
  if (record.channelId && record.channelId !== channel.id) issues.push(`channelId must be ${channel.id}`);
  if (record.assetScope && record.assetScope !== channel.assetScope) issues.push(`assetScope must be ${channel.assetScope}`);
  if (record.masterAssetPath && record.masterAssetPath !== character.masterAssetPath) issues.push(`masterAssetPath must be ${character.masterAssetPath}`);

  const sources = (record.images || record.visualAssets || []).map((asset) => clean(asset?.src || asset?.localSrc || asset?.publicUrl));
  if (channel.id === ATLAS_CHANNEL_ID.KOREA_NAVER) {
    if (clean(record.blogId) && clean(record.blogId) !== channel.blogId) issues.push(`blogId must be ${channel.blogId}`);
    if (sources.some((src) => /cloudinary\.com\/.*atlas\/articles|public\/images\/articles/i.test(src))) {
      issues.push("global Blogger asset detected in Korea draft");
    }
  } else if (sources.some((src) => /atlas-generated:|\.atlas-data[\\/]korea-assets/i.test(src))) {
    issues.push("Korea Naver asset detected in global article");
  }
  return { ok: issues.length === 0, issues };
}

export function validateNaverWriteTarget(draft = {}) {
  const issues = [];
  const logNo = clean(draft.logNo);
  if (PROTECTED_NAVER_POSTS.includes(logNo)) issues.push(`protected Naver post ${logNo} is immutable`);
  if (draft.contentType === "new_product_review" && logNo) issues.push("new Naver post must not have logNo");
  if (draft.contentType === "existing_post_update" && !logNo) issues.push("existing Naver update requires logNo");
  return { ok: issues.length === 0, issues };
}

export function assertNaverWriteTarget(draft = {}) {
  const result = validateNaverWriteTarget(draft);
  if (!result.ok) {
    const error = new Error(result.issues.join("; "));
    error.code = "NAVER_PROTECTED_TARGET";
    throw error;
  }
  return true;
}
