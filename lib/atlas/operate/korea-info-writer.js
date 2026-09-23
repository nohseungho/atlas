// 국내 Naver(수호) 생활편의·시즌 정보글 작성기.
//
// topic-catalog.js의 검증된 주제 자료만으로 본문과 이미지 슬롯을 조립한다.
// 제휴 링크가 없어도 발행 가능한 정보글이므로 affiliateUrl/disclosure를 만들지 않는다.
// 제품을 소개하는 경우에만 실제 제품 사진 슬롯(role: "product_photo")을 추가하며,
// 그 슬롯은 자동 생성 대상이 아니라 실제 사진 업로드 대상이다.

const KICKER = "ATLAS 생활정보";

function heading(text) {
  return String(text || "").trim();
}

// 네이버 본문은 빈 줄로 나뉜 블록 단위로 렌더된다(lib/atlas/naver-image-placement.js).
// 한 줄짜리 짧은 블록은 소제목으로 렌더되므로 소제목은 반드시 독립 블록으로 둔다.
export function koreaInfoBodyText(topic) {
  const blocks = [topic.lead];
  for (const section of topic.sections) {
    blocks.push(heading(section.heading));
    for (const paragraph of section.paragraphs) blocks.push(paragraph);
  }
  blocks.push("오늘의 체크리스트");
  blocks.push(topic.checklist.map((item) => `- ${item}`).join("\n"));
  blocks.push("자주 묻는 질문");
  for (const item of topic.faq) blocks.push(`Q. ${item.q}\nA. ${item.a}`);
  blocks.push("마무리");
  blocks.push(
    "생활 정보는 한 번에 다 바꾸기보다 순서대로 하나씩 확인하는 편이 오래 갑니다. 오늘은 체크리스트 중 하나만 해보셔도 충분합니다.",
  );
  return blocks.filter(Boolean).join("\n\n");
}

// 수호 마스터를 합성한 무료 로컬 카드 3장.
//
// 카드 문구는 주제 파일의 topic.cards에서 그대로 가져온다. 본문 문단을 기계적으로
// 잘라 쓰면 "친척과 지인은 반대입니다."처럼 맥락이 끊긴 조각이 카드에 박히고,
// 고정 footer를 쓰면 다른 주제의 마무리 문장이 그대로 따라붙는다(실제 검수에서 발견).
// 그래서 카드 문구는 주제마다 명시하고, 여기서는 배치와 앵커만 계산한다.
export function koreaInfoImages(topic) {
  const [first, second] = topic.sections;
  const cards = topic.cards || {};
  const slots = [
    {
      id: "img_info_why",
      role: "info_why",
      card: cards.why,
      placement: `${first?.heading || "도입"} 문단 뒤`,
      anchorKeywords: [first?.heading || "", topic.keyword].filter(Boolean),
      alt: `${topic.keyword} 핵심 정리`,
    },
    {
      id: "img_info_how",
      role: "info_how",
      card: cards.how,
      placement: `${second?.heading || "본문"} 문단 뒤`,
      anchorKeywords: [second?.heading || ""].filter(Boolean),
      alt: `${topic.keyword} 기준 정리`,
    },
    {
      id: "img_info_checklist",
      role: "info_checklist",
      card: cards.checklist,
      placement: "체크리스트 문단 뒤",
      anchorKeywords: ["오늘의 체크리스트", "체크리스트"],
      alt: `${topic.keyword} 체크리스트`,
    },
  ];
  return slots.map((slot) => ({
    id: slot.id,
    role: slot.role,
    src: "",
    alt: slot.alt,
    placement: slot.placement,
    anchorKeywords: slot.anchorKeywords,
    card: {
      kicker: KICKER,
      title: slot.card.title,
      columns: slot.card.columns,
      footer: slot.card.footer,
    },
  }));
}

// 제품을 함께 소개할 때만 호출한다. 자동 생성하지 않고 실제 제품 사진을 연결해야 하는 슬롯이다.
export function koreaProductPhotoSlot({ productName = "", placement = "제품 소개 문단 뒤" } = {}) {
  return {
    id: "img_product_photo",
    role: "product_photo",
    src: "",
    alt: `${productName} 실제 제품 사진`.trim(),
    placement,
    anchorKeywords: [productName].filter(Boolean),
  };
}

export function buildKoreaInfoDraft(topic, { id } = {}) {
  return {
    id: id || `kr_${topic.id}`,
    contentType: "info_guide",
    blogId: "who-ami",
    title: topic.title,
    productName: "",
    productUrl: "",
    affiliateUrl: "",
    affiliateDisclosure: "",
    bodyText: koreaInfoBodyText(topic),
    images: koreaInfoImages(topic),
    topicId: topic.id,
    keyword: topic.keyword,
    generatedBy: "ATLAS_KOREA_INFO_V1",
    generatedAt: new Date().toISOString(),
  };
}
