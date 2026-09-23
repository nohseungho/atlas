# ATLAS 단일 운영 화면 (`/atlas/operate`)

국내(Naver·수호)와 해외(Blogger·미지)를 각각 한 화면에서
**주제 선택 → 자동 작성 → 이미지 생성 → 미리보기 → 발행 → 공개 URL 확인**까지 끝낸다.

## 구성

| 역할 | 파일 |
| --- | --- |
| 화면 | `app/atlas/operate/page.js` |
| 상태·작성·이미지 API | `app/api/atlas/operate/route.js` |
| 미리보기용 로컬 이미지 | `app/api/atlas/operate/asset/route.js` |
| 주제 원천 | `lib/atlas/operate/topic-catalog.js` |
| 국내 정보글 작성기 | `lib/atlas/operate/korea-info-writer.js` |
| 해외 문답형 작성기 | `lib/atlas/operate/global-dialogue-writer.js` |
| 실제 이미지 생성 | `lib/atlas/operate/image-render.js` + `scripts/atlas-image-worker.mjs` |
| 중복 발행 색인 | `lib/atlas/operate/published-index.js` |

## 재사용한 기존 기능

새 파이프라인을 만들지 않고 검증된 경로를 그대로 호출한다.

- 국내 검수·승인: `PATCH /api/atlas/korea-drafts` (`review` → `approve`)
- 국내 발행: `POST /api/atlas/korea-publish` (운영 정책 게이트 + Edge 자동화)
- 해외 승인: `POST /api/atlas/publisher-approval`
- 해외 발행: `POST /api/publish` (승인 게이트·중복 차단·발행 후 공개 확인)
- 해외 공개 이미지: `POST /api/articles/upload-visuals` (`mode: "prepare"`)
- 해외 원고 검증·정규화: `lib/atlas/article-factory.js`
- 렌더링: `lib/atlas/revenue-design-engine.js` (Quick Answer / TOC / FAQ / Sources)

## 채널 규칙

`lib/atlas/character-channel-policy.js`가 유일한 기준이며 우회하지 않는다.

- 국내: 수호 고정, `ATLAS-SUO-MASTER.png`, 자산은 `.atlas-data/korea-assets/`
- 해외: 미지 고정, `ATLAS-MIJI-MASTER.png`, 자산은 `public/images/articles/<slug>/`
- 해외 본문은 미지↔수호 문답이지만 **이미지는 전부 미지**다.
  해외 이미지의 alt/prompt에 수호를 쓰면 `validateChannelIdentity`가 차단한다.

## 발행 게이트

이미지가 **실제 파일로 생성되어 연결되기 전에는** 발행 버튼이 열리지 않는다.

- 국내: `koreaMissingRequiredImages` + `publishBlockers`
  (정보글도 연결된 이미지가 없으면 `no image linked`로 막힌다)
- 해외: `global_required_images_public` — 5장 모두 공개 https URL이어야 한다.

## 중복 방지

`published-index.js`가 `articles.json` · `korea-drafts.json` ·
`publisher-state.json` · `publishing.json`을 모아 공개된 글의
제목 / slug / 키워드 / topicId를 색인한다. 겹치는 주제는 주제 선택 단계에서
사유와 함께 막히고, 발행 단계에서는 기존 `ALREADY_PUBLISHED` 게이트가 한 번 더 막는다.

## 기존 자료 보존

- "본문 다시 작성"은 본문만 갱신하고 이미 연결된 이미지 `src`와 공개 URL은 유지한다.
- 운영 화면은 `topicId`가 있는 미발행 초안만 현재 작업물로 잡는다.
  기존 미발행 초안과 발행 완료 글은 읽기만 한다.

## 이미지 생성 (유료 API 없음)

이미 설치된 `playwright-core`와 Edge로 카드 이미지를 헤드리스 렌더해 PNG를 쓴다.
외부 이미지 생성 API를 호출하지 않는다.

## 운영 시 필요한 외부 연결

- 국내: ATLAS 전용 Edge 프로필의 네이버 로그인 세션 (최초 1회 로그인)
- 해외: Blogger OAuth(연결됨) + 공개 이미지 호스팅 `CLOUDINARY_URL` (`.env.local`)

## 검증

```
npm run operate:verify
node --test lib/atlas/*.test.mjs lib/atlas/operate/*.test.mjs
```
