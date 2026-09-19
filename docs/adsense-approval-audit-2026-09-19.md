# ATLAS AdSense 승인 감사 — 2026-09-19

대상: 해외 Blogger `atlas-money-2026.blogspot.com` (미지) · 국내 Naver `blog.naver.com/who-ami` (수호)
방법: 공개 페이지 HTTP 수집(Blogger posts/pages feed, Naver RSS·모바일 PostView) + headless Chrome 렌더(1440px/390px) + 로컬 코드 점검.
브라우저 자동화 런타임(MCP)은 세션에 없어 Playwright(playwright-core + 로컬 Chrome)로 대체했다. 실제 AdSense 콘솔·Search Console은 접근하지 않았다(확인 불가 항목으로 표기).

## 1. 공개 사이트 감사 결과 (확인된 사실)

### Blogger (17 posts, 4 pages)
| 항목 | 결과 |
|---|---|
| 공개 글 | 17개, 2026-07-10 ~ 2026-09-18. 본문 1,141~2,497 단어. 모두 FAQ 1 / Sources 1 |
| 정책 페이지 | About(331w) · Contact(81w, 이메일) · Privacy Policy(328w) · Affiliate Disclosure(232w) — 헤더 PageList1 + 푸터 PageList2 양쪽에 링크 |
| 광고 코드 | 홈 HTML에 `adsbygoogle` 5회, `ca-pub-7155628492487666` 4회 → 사이트가 이미 AdSense에 연결·코드 삽입됨 |
| robots / ads.txt | robots.txt 정상(Mediapartners 허용), sitemap 선언, `/ads.txt` 200 |
| 이미지 | 글 내 이미지 76개 전부 Cloudinary, HEAD 200 (깨진 이미지 0) |
| 외부 링크 | 46개 중 23개가 curl에 403 — 전부 state.gov / cdc.gov / naic.org / transportation.gov / unicef / noaa 등 봇 차단 WAF. **깨진 링크로 단정 불가**, 브라우저 수동 확인 필요 |
| 캐릭터 | 미지 5장 체계(art_009~art_021), 얼굴 일치도 low 1컷(art_021 border), medium 1컷(offline) — Publisher 배지로 표시 중 |

### Naver (공개 2개)
| logNo | 제목 | 결과 |
|---|---|---|
| 224416535205 | 추석 과일 선물, 제주 황금향 2kg | 본문 ~2,100자, 이미지 2, 쿠팡 링크 1, **파트너스 고지 있음(본문 후반부, 약 75% 지점)** |
| 224412747695 | 멀티탭 고르는 법 | 본문 ~2,250자, 이미지 3, 쿠팡 링크 1, 파트너스 고지 **본문 첫 줄** |
| 224407589323 (보호글) | — | 모바일 PostView `noPost`(비공개 또는 삭제 상태). **수정하지 않음** |

Naver는 AdSense 대상이 아니지만 쿠팡 파트너스 고지 위치가 글마다 다르다(아래 후보 참조).

## 2. 승인 저해 요인과 근거

우선순위 순. 「사실」은 위 수집으로 확인, 「추정」은 원인 해석.

1. **[UX·사실] 모든 페이지에 가로 스크롤 32px** — `.centered-top-container{width:100%!important}`(content-box) + 좌우 padding 16px → 1440px에서 scrollWidth 1472, 390px에서 422. 모바일에서 좌우 흔들림. 원인: 라이브 테마 CSS. 수정: Blogger 테마 → 맞춤설정 → CSS 추가에 `.centered-top-container{box-sizing:border-box!important}` 1줄(부가적, 안전). 저장소의 `docs/blogger-theme/ATLAS_THEME_R2_FINAL.xml`은 라이브와 **이미 달라져** 있어(라이브는 헤더 nav 표시, 저장소본은 숨김) 전체 교체용으로 쓰면 회귀한다 → XML은 건드리지 않았다.
2. **[콘텐츠·사실] 홈 Featured guide가 가장 오래되고 가장 약한 글** — 2026-07-10 「How to Compare Travel Insurance…」: 이미지 0장, 라벨이 문장 조각으로 깨짐(`"and claim rules before buying."`, `"Use this travel insurance worksheet to compare cancellation"` 등 7개). 첫 화면 첫 인상이 가장 낮은 품질 글이다. 추정 원인: 7월 수동 발행 시 검색설명 문장을 라벨란에 붙여넣음. 로컬 art_002에는 Cloudinary 이미지 3장이 준비돼 있으나 LIVE에 반영되지 않았다.
3. **[SEO·사실] 글 `<meta name="description">` 없음, og:description이 "Last updated… Table of Contents…"로 시작** — Blogger 설정의 검색 설명(Search description)이 꺼져 있거나 글별 값이 비어 있음(API insert는 검색설명을 쓰지 못함). 홈 카드 요약도 같은 텍스트로 시작. 코드 원인은 이번에 수정(§3-1); 설정은 수동.
4. **[콘텍스트·사실] art_021 LIVE의 Official Sources 3개가 클릭 불가 텍스트** — 자동 링크 코드(5fc603c)가 LIVE 재반영(01:00) 이후에 들어갔음. 기존 동기화 경로로 재반영하면 해결(§5 후보).
5. **[정책 페이지·사실] Privacy Policy에 광고 쿠키 고지 부재** — "Google, cookie, third-party"는 언급하나 AdSense 필수 문구(Google이 광고 쿠키를 사용해 사용자의 이전 방문 기반 광고를 게재, 광고 설정(https://www.google.com/settings/ads)에서 맞춤 광고 해제, www.aboutads.info)가 없다. AdSense 프로그램 정책의 필수 개인정보 고지 항목.
6. **[사이트 전체·추정] 글 수 17개·최근 3개월 집중** — 콘텐츠 양은 승인 요건에 통상 충분하나, Insurance/Health 계열이 15개로 편중되어 "YMYL" 성격이 강하다. About 페이지는 "insurance를 팔지 않는다"고 명시하고 있어 완화 요소. 작성자 실명·프로필 부재는 추정 위험(AdSense 필수는 아님).
7. **[확인 불가]** AdSense 콘솔의 실제 거절 사유, Search Console 색인 수, 사이트 소유권 확인 상태는 이 세션에서 접근할 수 없어 확인하지 못했다.

## 3. 직접 수정한 내용 (로컬 코드, 커밋)

1. `lib/atlas/revenue-design-engine.js` — 본문이 `## Quick Answer`로 시작하면 그 섹션을 TOC/Key Takeaways 위로 올림(`splitLeadSection`). 발행 HTML의 첫 텍스트가 답변 문장이 되어 og:description·홈 카드 요약이 "Last updated… Table of Contents…"가 아니라 실제 답으로 시작한다. 핸드오프 본문(atlas-h2 id 없음)·Quick Answer 없는 본문은 그대로.
2. `lib/atlas/revenue-assembly.test.mjs` — 위 동작 테스트 2개(hoist 됨 / 분리되지 않음).
3. `docs/adsense-approval-audit-2026-09-19.md` — 이 보고서.

라이브 글·Blogger 설정·테마는 변경하지 않았다.

## 4. 테스트·빌드
- `node --test lib/atlas/*.test.mjs` 362/362 PASS
- eslint 0
- `next build` 성공(46/46)
- localhost:3002 `/atlas` `/atlas/unified-publish` `/publisher` `/atlas/korea` 200, Publisher 운영정책 패널 렌더 확인, art_021 로컬 미리보기 390px에서 Quick Answer → Last updated → TOC 순서 확인
- 실제 publish/update API 호출 없음(Playwright에서 POST 차단)
- 참고: `127.0.0.1:3002`로 접속하면 Next dev의 allowedDevOrigins 경고로 클라이언트가 하이드레이션되지 않는다. 서버 오류가 아니며 `localhost:3002`를 사용해야 한다.

## 5. 남은 작업 (수동) 및 공개 글 수정 후보

### 재신청 전 필수
| # | 작업 | 위치 | 근거 |
|---|---|---|---|
| A | CSS 1줄 추가 `.centered-top-container{box-sizing:border-box!important}` | Blogger 테마 → 맞춤설정 → 고급 → CSS 추가 | §2-1 가로 스크롤 |
| B | Privacy Policy에 광고 쿠키 단락 추가 | Blogger Pages → Privacy Policy | §2-5. 문안: "Third-party vendors, including Google, use cookies to serve ads based on a user's prior visits to this website or other websites. Google's use of advertising cookies enables it and its partners to serve ads based on your visit to this site and/or other sites on the Internet. You may opt out of personalized advertising by visiting Ads Settings (https://www.google.com/settings/ads) or www.aboutads.info." |
| C | 검색 설명 활성화 + 글별 metaDescription 입력 | Blogger 설정 → 메타태그 → 검색 설명 사용; 글 편집기 우측 "검색 설명" | §2-3. 로컬 articles.json의 `metaDescription`을 그대로 붙이면 된다 |
| D | Featured guide 교체 | 테마 HTML의 `atlas-featured` 블록 링크 | §2-2. 후보: art_021(EES) 또는 Seniors Over 65 가이드 |

### 공개 글 수정 후보 (자동 실행하지 않음)
| 글 | 조치 | 경로 |
|---|---|---|
| art_002 「How to Compare Travel Insurance…」 | 깨진 라벨 7개 삭제 → `Travel Insurance`, `Trip Planning` 정도로 교체; 로컬에 준비된 이미지 3장 반영 | 라벨: Blogger 편집기(또는 `/api/atlas/seo-backfill` confirm:true) · 이미지: Publisher → 이미지 동기화·Blogger 반영(`upload-visuals mode=sync`, 검증된 postId만 patch) |
| art_021 「Europe EES…」 | Sources 3개 클릭 링크 + Quick Answer 선두 배치 반영 | Publisher → 이미지 동기화·Blogger 반영(같은 경로가 `buildBloggerHtml` 최신본으로 patch) |
| art_004~006 | 로컬 `publicUrl` 비어 있으나 LIVE는 이미지 5장 — 데이터 드리프트만 있음, LIVE 조치 불필요 | 로컬 데이터 정리는 별도 |
| Naver 224416535205 황금향 | 파트너스 고지를 본문 첫 줄로 이동(멀티탭 글과 통일) | Naver 편집기 수동 |
| Naver 224407589323 | 비공개/삭제 상태 유지. **수정 금지 대상** | — |

### 확인 불가로 남긴 것
- AdSense 콘솔 거절 사유·정책 위반 알림
- Search Console 색인/소유권
- 403을 반환한 정부·기관 링크 23개의 실제 작동 여부(브라우저에서 수동 클릭 확인 필요)

## 6. LIVE 수정 결과 (2026-09-19, 감사 후 실행)

경로: `POST /api/atlas/live-refresh` (신규, posts.patch / pages.patch 전용, `confirm:true` 필수, postId+publishedUrl 검증, 운영정책 게이트 통과 후 전송).

| 대상 | 조치 | 결과 |
|---|---|---|
| art_021 (EES) | 최신 어셈블러 HTML 재반영(Quick Answer 선두, Sources 3개 `<a target=_blank rel=noopener>`), 라벨 5개, 검색설명 146자 | LIVE 확인: Sources 링크 3개, 이미지 5장, og:description이 답변 문장으로 시작 |
| art_002 (Featured 대상) | 라이브 본문 유지 + 준비된 Cloudinary 이미지 3장 삽입(top / Step 4 앞 / FAQ 앞), 깨진 라벨 7개 → `Travel Insurance, International Travel, Trip Cost`, 검색설명 156자 | LIVE 확인: 이미지 3장, 라벨 3개, 문장조각 라벨 0 |
| art_011 (Seniors) | 라벨 4개 + 검색설명 154자 (본문 무변경) | API 200 |
| Privacy Policy 페이지 | "Advertising and Google AdSense" 단락(광고 쿠키·Ads Settings 해제·aboutads.info) 을 "External and Affiliate Links" 앞에 삽입 | LIVE 확인: 문구·링크 존재, 중복 0 |

미수정(API로 불가, Blogger UI 수동):
- 가로 스크롤 32px — 테마 → 맞춤설정 → 고급 → CSS 추가: `.centered-top-container{box-sizing:border-box!important}`
- 홈 Featured 교체 — 테마 HTML `atlas-featured` 블록의 제목/설명/링크 교체(후보: art_021 또는 art_011). 현 Featured(art_002)는 이미지·라벨이 정리되어 임시로는 볼 만한 상태.
- 검색 설명 노출 — 설정 → 메타 태그 → "검색 설명 사용" ON. customMetaData는 API로 저장됐으나 이 설정이 꺼져 있어 `<meta name="description">`이 아직 출력되지 않음.
