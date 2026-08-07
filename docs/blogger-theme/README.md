# ATLAS Blogger Theme — Preserved Baseline

이 디렉터리는 **실제 Blogger에 적용되어 있는 테마 원본**을 버전관리에 보존하기 위한 곳입니다.
이전에는 테마 XML이 `tmp/`(gitignore 대상)에만 존재해 저장소에 추적되지 않았고, 유실 위험이 있었습니다.

## 현재 적용 기준 테마

| 항목 | 값 |
|---|---|
| 파일명 | `ATLAS_THEME_R2_FINAL.xml` |
| 원본 경로 | `tmp/theme-audit/ATLAS_THEME_R2_FINAL.xml` (추적되지 않는 작업 디렉터리) |
| 보존 날짜 | 2026-07-21 |
| 파일 크기 | 144,474 bytes |
| SHA-256 | `093d6f885ab18db49570c80de0ac4143a3c7d50971c1af77a8ce6be53afda65e` |
| 대상 블로그 | https://atlas-money-2026.blogspot.com/ |

## Blogger 적용 기준본임을 확인한 근거

2026-07-21, 공개 홈(`https://atlas-money-2026.blogspot.com/`)의 raw HTML을 읽기 전용으로
내려받아 이 XML과 대조했습니다. 라이브 HTML에서 다음이 모두 확인되었습니다.

- 주석 마커 `ATLAS Blogger Revenue Theme R2`
- R2에서 추가된 클래스: `atlas-home-intro`, `atlas-featured`, `atlas-trust-strip`,
  `atlas-review-promise`, `atlas-footer-links`
- R2의 홈 전용 게시글 숨김 규칙 4줄이 인라인 CSS에 그대로 존재:
  `body:not(.item-view) #Blog1 .post-outer-container:has(a[href*="/site-verification.html"])` 외 3건

같은 디렉터리의 `ATLAS_THEME_R1_FINAL_SOURCE.xml`(143,151 bytes)에는 R2 마커와
`atlas-footer-links`가 **없으므로** 라이브 기준본이 아닙니다. R2가 현재 기준본입니다.

## 복원 시 주의사항

- 이 XML은 Blogger 테마 편집기의 **전체 교체용 원본**입니다. 부분 붙여넣기 금지.
- 복원 전 반드시 Blogger에서 **현재 테마를 백업**한 뒤 교체하십시오.
- `<b:widget>`의 `id` 값(`Blog1`, `PageList2`, `Attribution1` 등)은 Blogger가 위젯 데이터와
  연결하는 키입니다. id를 바꾸면 기존 위젯 설정(Footer Links의 페이지 목록 등)이 끊어집니다.
- Footer의 정책 페이지 링크는 이 XML이 아니라 **Blogger Pages + PageList2 위젯 설정**에
  저장되어 있습니다. XML만 복원해도 링크 목록은 복구되지 않습니다.
- Footer의 Copyright 문구는 Blogger 설정값(`data:copyright`)이며 현재 비어 있습니다.
  XML에는 출력 조건만 있고 문구 자체는 없습니다.

## ⚠️ 경고 — 수정 후 즉시 업로드 금지

이 파일을 수정한 뒤 검토 없이 Blogger에 업로드하지 마십시오.

- 테마 오류는 **공개 블로그 전체를 즉시 깨뜨립니다.** 스테이징 환경이 없습니다.
- 게시글 본문 HTML(Revenue Layout/Design Engine 산출물)은 이 테마와 별개입니다.
  테마를 고치면서 본문 구조를 함께 바꾸려 하지 마십시오.
- 홈 전용 영역(`atlas-home-intro`)은 `<b:if cond='data:view.isHomepage'>`로 감싸져 있습니다.
  이 조건을 제거하면 개별 게시글에 홈 전용 섹션이 섞여 나옵니다.
- `site-verification.html` 숨김 규칙을 지우면 검색엔진·제휴 네트워크 인증용 글이
  홈 목록에 다시 노출됩니다. 해당 글 자체는 **삭제하면 인증이 깨지므로** 삭제 금지입니다.

변경이 필요하면 이 저장소에서 먼저 diff로 검토하고, PM 승인 후 업로드하십시오.
