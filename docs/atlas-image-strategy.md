# ATLAS Image Strategy

## 원칙

이미지는 수익 흐름(검색 → 클릭 → Hook → 구매)의 각 단계를 강화하는 수단이다.
유료 서비스 없이 퀄리티를 확보한다.

---

## 무료 이미지 우선순위

### 1순위 — ComfyUI (Flux)

분위기·컨셉 이미지 생성. 제품 복제 목적 사용 금지.

| 용도 | 설명 |
|---|---|
| Hero Image | 글 상단 대표 이미지. 제품을 직접 묘사하지 않고 사용 상황·분위기 표현 |
| Lifestyle Image | 실사용 맥락 이미지. 피부 케어 루틴, 여행 장면, 요리 장면 등 |
| Thumbnail | CTR 최적화 썸네일. 텍스트 오버레이 + 배경 이미지 조합 |

**Flux 프롬프트 원칙**
- 제품명·브랜드명 포함 금지
- 실제 제품 외관 묘사 금지
- 분위기·색감·사용 맥락 위주로 작성
- 예시: `korean skincare morning routine, soft light, minimal aesthetic, no brand visible`

---

### 2순위 — Pexels

저작권 무료(CC0). 상업 용도 사용 가능. 출처 표기 불필요.

| 카테고리 | 검색어 예시 |
|---|---|
| 배경 | `minimal background`, `texture`, `gradient`, `white surface` |
| 여행 | `travel`, `airport`, `hotel room`, `city street` |
| 음식 | `korean food`, `asian cuisine`, `ramen`, `healthy snack` |
| 라이프스타일 | `skincare routine`, `morning routine`, `woman applying sunscreen` |

**사용 규칙**
- 인물이 포함된 사진: 모델 릴리즈 확인 후 사용
- 특정 브랜드 로고가 찍힌 사진: 편집하거나 사용 금지

---

### 3순위 — HTML/CSS (인라인 스타일)

코드로 만드는 정보 카드. 이미지 없이 신뢰도와 가독성을 높인다.
Blogger 인라인 스타일로 작성. 외부 CSS/JS 금지.

| 카드 유형 | 용도 |
|---|---|
| 비교표 (Comparison Table) | 제품 스펙 나란히 비교. SPF, 성분, 가격, 피부 타입 |
| Rating Card | 별점 또는 점수 표시. 항목별 평가 시각화 |
| Info Card | 핵심 정보 강조 박스. Quick Answer, Key Takeaway |
| Evidence Card | 근거 제시 카드. 성분명, 수치, 출처 텍스트 |

**HTML/CSS 카드 우선 조건**
- 제품 비교: 항상 HTML 카드 사용 (이미지 대신)
- 수치·데이터가 있는 정보: HTML 카드 사용
- 독자가 스캔하는 정보: HTML 카드 사용

---

### 4순위 — 직접 촬영 (장기 전략)

첫 수익 발생 이후 검토. 현 단계에서는 선택 항목.

| 대상 | 조건 |
|---|---|
| K-뷰티 제품 | 제품 직접 구매 후 촬영. Amazon에서 구매한 제품에 한함 |
| 음식·요리 | 직접 조리 과정 촬영 |
| 라이프스타일 | 사용 장면 연출 |

---

## 이미지 사용 원칙

- **제품 사진 무단 사용 금지** — 브랜드 공식 이미지, 상세페이지 이미지 복사 불가
- **Amazon 상세페이지 이미지 복사 금지** — Amazon 서비스 약관 위반
- **AliExpress 상세페이지 이미지 복사 금지** — 저작권 귀속 불명확
- **AI 생성 이미지는 분위기·컨셉 위주** — 특정 제품의 외관을 AI로 복제하는 것 금지
- **제품 비교는 정보 카드 중심** — 실제 제품 이미지 없이도 비교 가능한 구조로 설계

---

## 첫 수익 전 운영 원칙

```
유료 서비스 사용 금지.
무료 도구만 사용.

블로그 3개 발행
    ↓
CTR 확인 (Google Search Console)
    ↓
Affiliate 클릭 확인 (Amazon Associates Reports)
    ↓
수익 확인

3회 테스트 후에도 결과가 부족하면
유료 이미지 생성 도입 검토.
```

**무료 도구 목록**

| 도구 | 용도 | 비용 |
|---|---|---|
| ComfyUI + Flux | Hero / Lifestyle / Thumbnail 생성 | 무료 (로컬 실행) |
| Pexels | 배경·라이프스타일 스톡 이미지 | 무료 |
| HTML/CSS 인라인 | 비교표·카드 | 무료 |
| Google Search Console | CTR·노출 수 확인 | 무료 |
| Amazon Associates Central | 클릭·전환 추적 | 무료 |

---

## ATLAS 이미지 제작 순서

```
글 생성 (Revenue Writer Engine)
    ↓
Hero Image
(ComfyUI Flux — 분위기/컨셉. 제품 복제 금지)
    ↓
Info Card
(HTML/CSS — Quick Answer, Key Takeaway 시각화)
    ↓
Evidence Card
(HTML/CSS — 성분, 수치, 근거 표시)
    ↓
썸네일
(ComfyUI Flux + 텍스트 오버레이)
    ↓
Blogger 발행
```

**각 단계 기준**

| 단계 | 기준 | 건너뛰는 조건 |
|---|---|---|
| Hero Image | 글 상단 필수 | 없음 |
| Info Card | Key Takeaway 섹션이 있으면 필수 | 섹션 없으면 생략 가능 |
| Evidence Card | 수치·데이터 인용 시 필수 | 데이터 없으면 생략 가능 |
| 썸네일 | Blogger 발행 전 필수 | 없음 |

---

## ComfyUI Flux 프롬프트 템플릿

### Hero Image — K-뷰티

```
soft morning light, clean bathroom shelf, skincare products (no visible labels),
white towel, minimal aesthetic, pastel tones, editorial photography style,
no text, no brand logos
```

### Hero Image — K-푸드

```
korean kitchen counter, ceramic bowls, chopsticks, steam rising from food,
warm lighting, cozy atmosphere, top-down angle, no brand visible, no text
```

### Hero Image — 여행

```
international airport terminal, traveler with luggage, soft bokeh background,
natural light, editorial travel photography, no text, no logo
```

### Hero Image — AI/테크

```
minimal home office desk, laptop open, coffee cup, clean white background,
productivity aesthetic, soft shadows, no screen content visible, no text
```

### 썸네일 배경

```
clean gradient background, [primary color] to [secondary color],
minimal texture, no objects, suitable for text overlay
```
