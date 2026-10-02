# ATLAS 플랫폼 보강 검증 — 2026-10-02

## 작업 범위

- 저장소: nohseungho/atlas, 브랜치 `fix/naver-rss-dedupe`, 시작 HEAD `190f8e1`.
- 검증 환경: Linux 로컬 복제본. 집 PC `C:\Users\김보림\atlas`는 직접 접근하지 못했으며 변경하지 않았다.
- 실제 Naver/Blogger 게시·공개 글 수정·비공개 처리·삭제·push·main merge는 실행하지 않았다.
- 추적된 `data/atlas` 파일과 기존 공개 이미지에는 변경이 없다. UI/API 검증은 임시 데이터와 작은 테스트용 PNG를 사용했다.

## 반복 문제의 원인과 변경

네이버는 본문 전체를 먼저 전달한 뒤 키워드로 커서를 찾는 경로를 사용했고, 실제 editor block 순서를 검증하지 않았다. 해외 미리보기와 게시용 HTML은 MASTER 선택과 이미지 주소 처리에 차이가 있었다. 승인에는 이미지 위치와 파일 변경을 충분히 결합하지 못했고, 프로세스 메모리 잠금은 서버 재시작 후 중복을 막지 못했다. 운영 API 조회에도 특정 침구 글을 수정하는 예외가 있었다.

국내는 heading/paragraph/image의 순서와 `anchorAfter`를 담은 canonical document를 저장한다. 미리보기와 native publisher가 이를 사용한다. 해외는 기존 rich layout assembler의 결과를 lossless HTML fragment와 image block으로 보존한 같은 publishing model을 사용한다. 새 SmartEditor adapter는 문서 순서대로 입력·업로드하고 매 이미지 및 최종 editor-owned component를 비교한다. 제목·이미지 수·본문 사이의 이미지 순서·anchor·연속 이미지가 다르면 게시를 중단한다. 빈 새 글이 아닌 편집기는 보호하며 Select All로 기존 내용을 지우지 않는다. Naver의 실제 DOM이 계약과 다르면 우회하지 않고 실패한다.

국내 수호/해외 미지 마스터 정책을 유지한다. 해외는 최소 5장, 서로 다른 장면 지시, ArcFace >=0.5, 얼굴 1개와 이미지·마스터 파일 해시를 요구한다. 과거 점수만 있는 이미지는 얼굴 검수를 다시 해야 한다. 국내 기본 작성기의 방어적 문체와 침구 글 세 anchor도 수정했다. 제품 초안은 실제 제품 사진이 필수다.

## 사용자 흐름

`ATLAS.cmd` → 국내/해외 → 업데이트 및 주제 선택 → 글·장면 제작 → 미리보기 및 수정 → 전체 글·이미지를 포함한 검수 HTML 저장 → 대화에서 검증 → 해당 검수 완료 코드 반영 → 해외는 공개 이미지 연결 → 사용자 최종 승인/발행 → 성공 URL.

검수 코드는 로컬 사용자가 반환된 검수 결과를 확인하여 기록하는 장치이며, 원격 ChatGPT 인증이나 자동 AI 검증은 아니다. 검수 묶음에는 모든 이미지, 정책, anchor, 얼굴 기록과 검수용 해시가 들어 있다. 검수 확인과 사용자 발행 승인은 별개다. 글·이미지·anchor 변경은 둘 다 해제하며, 동일 검증 이미지에 공개 주소만 연결하면 최종 검수는 유지하고 발행 승인은 다시 검사한다. 승인 전 공개 이미지 업로드도 차단한다.

상태는 DRAFT / GENERATED / REVIEW_READY / USER_APPROVED / PUBLISHING / PUBLISHED이다. 실제 publisher는 USER_APPROVED와 현재 내용·파일의 일치를 요구한다. channel + articleId + approvedVersion의 디스크 작업 기록과 atomic claim이 중복 실행을 막는다. 성공 ID·URL·시각을 저장한다. 결과가 불명확하면 재시도를 차단하며 자동 재게시하지 않는다. 불명확 결과를 확인·해제하는 전용 UI는 아직 없다.

기존 Cloudinary 연결을 재사용하되 파일 해시를 포함한 immutable asset ID를 사용해 공개 이미지 교체를 방지한다. 기존 공개 글을 갱신하던 upload-visuals sync 경로는 차단했다. Blogger는 게시 직전에 대상 hostname이 atlas-money-2026.blogspot.com인지 확인한다.

업데이트는 무료 공개 뉴스 RSS와 참고 블로그 검색을 사용한다. 조회 시각과 출처를 표시하며 최근 7일 뉴스만 허용하고 24시간이 지난 결과는 최신 후보로 쓰지 않는다. 현재는 기존 생활·여행 주제/제품 목록과 연결하는 범위이며, 임의의 모든 이슈를 새 원고로 자동 해석하는 기능은 아니다. 외부 조회 실패는 확인된 최신 정보로 표시하지 않는다.

## 검증 결과

- `ATLAS_NAVER_BROWSER_PATH=/tmp/chromium npm test`: 전체 522개 통과, 실패/skip 0. A–H 및 실제 로컬 Chromium DOM에서 native insertion 계약 포함.
- `npm run lint`: 오류/경고 0. 기존 JSX escaping 및 mount 후 저장소 반영 오류도 같은 저장소에서 정리했다.
- `npm run build`: 성공. 기존 local-image-engine 동적 파일 경로에 대한 Turbopack tracing 경고 1개가 남는다.
- `npm run workflow:verify`: localhost:3002 첫 화면, 국내/해외 선택, canonical preview anchor, 발행 비활성화, 승인 전 차단·승인 후 수정 시 해제, 양 채널 dry-run 통과. 브라우저 예외 0, 실제 publisher 호출 0.
- `git diff --check`: 통과. 기존 추적 데이터 변경 없음.
- Windows launcher: 3002 고정, 시작 mutex, 기존 서버 재사용, 브라우저 열기, 소유 프로세스 Windows Job Object 종료 구조 구현. Linux에서 .cmd 실행은 검증하지 못했다.

## 남은 실제 환경 검증

1. 집 PC에서 변경 적용 후 ATLAS.cmd 더블클릭, 중복 실행, 종료 및 프로세스 정리.
2. 설치된 ComfyUI와 ArcFace runtime으로 실제 수호/미지 장면 생성 및 얼굴 검수. 여기서는 실제 이미지 생성이나 ArcFace 추론을 실행하지 않았다.
3. Naver 로그인/SmartEditor 실제 markup·사진 업로드·anchor 배치의 비게시 stage 확인. 실제 외부 편집기는 로컬 mock과 다를 수 있다.
4. 기존 Blogger OAuth/Cloudinary 계정, 대상 URL, 검증 이미지의 공개 주소 연결 확인.
5. 뉴스 RSS/참고 블로그·판매처 최신 자료 실제 조회. 이 환경에서는 라이브 최신 검색을 성공했다고 검증하지 않았다.
6. 실제 신규 게시 성공 URL 확인은 최종 사용자 승인 후에만 수행한다. 이번 작업에서는 실행하지 않았다.

## 변경 파일

- `app/about/page.js`
- `app/affiliate-disclosure/page.js`
- `app/api/articles/upload-visuals/route.js`
- `app/api/atlas/korea-drafts/route.js`
- `app/api/atlas/korea-publish/route.js`
- `app/api/atlas/operate/route.js`
- `app/api/publish/route.js`
- `app/atlas/blog-studio/page.js`
- `app/atlas/layout.js`
- `app/atlas/navigation-boundary.js`
- `app/atlas/operate/page.js`
- `app/atlas/revenue/page.js`
- `app/atlas/video-library/page.js`
- `app/contact/page.js`
- `app/money-hunter/page.js`
- `app/privacy/page.js`
- `docs/atlas-platform-verification.md`
- `lib/atlas/article-document.js`
- `lib/atlas/article-document.test.mjs`
- `lib/atlas/character-channel-policy.js`
- `lib/atlas/face-match.js`
- `lib/atlas/face-proof.js`
- `lib/atlas/final-review.js`
- `lib/atlas/fixtures/bedding-review.json`
- `lib/atlas/korea-product-pipeline.js`
- `lib/atlas/naver-browser-publisher.js`
- `lib/atlas/naver-document-editor.browser.test.mjs`
- `lib/atlas/naver-document-editor.js`
- `lib/atlas/operate/image-render.js`
- `lib/atlas/operate/korea-info-writer.js`
- `lib/atlas/operate/publish-approval-store.js`
- `lib/atlas/operate/scene-art.js`
- `lib/atlas/operate/topic-catalog.js`
- `lib/atlas/operate/topic-research.js`
- `lib/atlas/providers/blogger-provider.js`
- `lib/atlas/publish-review.js`
- `lib/atlas/publish-transaction.js`
- `lib/atlas/request-origin.js`
- `lib/data-store.js`
- `lib/html-exporter.js`
- `package.json`
- `scripts/atlas-face-check.py`
- `scripts/atlas-process-job.ps1`
- `scripts/atlas-scene-generate.mjs`
- `scripts/atlas-test.mjs`
- `scripts/atlas-workflow-verify.mjs`
- `scripts/naver-browser-worker.mjs`
- `scripts/start-atlas.ps1`
