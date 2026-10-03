# ATLAS 플랫폼 보강 검증 — 2026-10-02

## PNG 손상 차단 및 로컬 복구 — 2026-10-03 (한국 시간)

- 미커밋 checklist.png는 IDAT 중간이 잘렸지만 HEAD의 2061268바이트 원본은 PNG chunk/CRC/IEND 검사 정상이다. 손상본을 `.atlas-data/recovery/checklist-truncated-70c0658c0be2cb8a.png`에 보관하고 digest/복구 원본 커밋을 JSON으로 기록한 뒤 로컬 파일을 HEAD 원본과 같은 바이트로 복구했다. Git의 원본 이미지는 변경하지 않았으며 공개 블로그도 변경하지 않았다.
- 기존 검수는 파일 존재 여부만으로 ready를 판단했다. PNG signature가 있는 파일은 chunk 길이·CRC·IHDR/IEND·IDAT 압축 데이터 검사를 거쳐 손상 시 ready=false 및 구체적인 검수 차단 이유를 반환한다. 빈 파일도 준비된 이미지로 보지 않는다. 다른 이미지 형식과 얼굴·장면 검수는 기존 경로를 유지한다.
- 손상 이미지의 실제 bytes hash는 계속 검수 해시에 반영되어 기존 승인을 재사용할 수 없다. 복구가 최종 검수/얼굴 합격/발행 승인을 생성하지 않는다.
- 해당 art_021의 5장 파일은 읽을 수 있지만 얼굴 검수 fail, 장면 지시 누락, 최근 여권 글과 주제 중복으로 계속 차단된다.
- 테스트 533개 통과, 실패/skip 0. 잘린 chunk, IEND 누락, CRC 오류, 정상 CRC지만 잘못된 압축 데이터, 실제 검수 packet ready/hash 변화 회귀 검증 통과. 검사 fixture의 잘못된 1px PNG도 정상 PNG로 교정했다.
- lint 통과, build 성공(기존 tracing 경고 1개), workflow:verify 국내/해외·image anchor·stage·승인 게이트 통과, 실제 publisher 호출 0회. 실제 집 PC 적용/네이버 로그인 검증은 미완료.

## 유지된 브라우저 재연결 보완 — 2026-10-03 (한국 시간)

- 기존 stage는 Edge와 worker를 유지했다. 다음 작업은 같은 프로필을 새로 실행하려 해 프로필 점유 때문에 막힐 수 있었다. ATLAS 전용 프로필의 DevToolsActivePort에 기록된 임의 browser 경로/loopback 포트로 기존 브라우저에 재연결한다. 다른 프로필은 찾거나 연결하지 않는다.
- 새로 여는 ATLAS 브라우저는 loopback에서만 임의 debugging 포트를 사용한다. 닫힌 브라우저는 같은 프로필로 다시 연다. 재연결이 불가능한 구버전의 잠긴 프로필은 명확한 오류를 내며 브라우저를 강제 종료하지 않는다.
- 최초 worker만 유지하고 재연결 worker는 CDP 연결을 끊은 뒤 종료한다. 기존 검수 탭과 로그인 쿠키는 유지된다. 실제 사용자 로그인 정보를 읽거나 출력하지 않았으며, 쿠키 유지 테스트는 가짜 atlas.local 쿠키로 진행했다.
- 테스트 531개 통과, 실패/skip 0; lint 통과; build 성공(기존 tracing 경고 1개). 실제 로컬 Chromium에서 재연결·쿠키 보존·기존 탭 보존·연결만 종료·본문 사이 이미지 3장 삽입 검증 통과.
- workflow:verify 국내/해외 UI, stage 버튼, 승인 게이트, 이미지 anchor 통과. 실제 publisher 호출 0회.
- 보존 중인 미커밋 해외 checklist.png는 720896바이트이며 IDAT chunk가 잘린 PNG임을 읽기 전용 검사로 확인했다. 원본을 덮어쓰거나 이번 커밋에 포함하지 않았다.
- Windows Edge 및 실제 네이버 로그인 유지/본문 입력은 아직 직접 검증하지 못했다. 기존 공개 글 변경·실제 발행 없음.

## 플랫폼 비발행 검증·진단 보완 — 2026-10-03 오전 (한국 시간)

- 시작 시 `fix/naver-rss-dedupe`의 기존 커밋을 이어받았으며, 해외 checklist.png의 별도 미커밋 변경을 확인하고 보존했다. 해당 이미지는 이번 커밋에 포함하지 않는다.
- 운영 화면에 국내 ‘네이버 편집기 검증 (발행 안 함)’ 버튼을 추가했다. 승인 API를 호출하지 않고 stage 요청만 전송한다. 실패 진단과 오류를 초안에 저장하며 운영 화면에서 다시 열람할 수 있다.
- 실제 page/frame 주소가 who-ami의 PostWriteForm이고 logNo가 비어 있어야 입력한다. 블로그 홈, 다른 계정, PostUpdateForm, PostView, 기존 logNo는 입력을 차단한다. 제목 입력·이미지 업로드·발행 단계 진입 전에 다시 확인한다.
- 기존 3장 위치 검증, 미지 5장/파일 해시/얼굴 점수 검수, 승인·중복 게이트를 보존했다. Node module-type 경고는 런타임 오류로 취급하지 않는다.
- 테스트 528개 통과, 실패/skip 0; lint 통과; build 성공(기존 Turbopack tracing 경고 1개). 임시 Chromium 파일이 사라져 무료 브라우저 패키지를 저장소 밖에 복구했으며 프로젝트 의존성은 추가하지 않았다.
- `workflow:verify`: localhost:3002 국내·해외 UI, 이미지 anchor, 최종 묶음 다운로드, 발행 비활성화, 승인 수정 시 무효화, 새 stage 버튼의 mode 및 승인 미생성 통과. 외부 요청을 차단하고 stage 응답을 mock했으며 실제 publisher 호출 0회.
- 집 PC에 원격 변경을 적용하거나 실제 네이버 로그인/본문 입력을 검증하지 못했다. 실제 발행·기존 공개 글 변경·다른 프로젝트 변경 없음.

## 로그인 후 블로그 홈 정지 보완 — 2026-10-03 (한국 시간)

- 사용자가 최신 stage에서도 본문 탐색 오류와 최종 블로그 홈 주소를 제공했다. 실제 로그인 이후 편집기로 가지 못한 상황이며, 이전 selector 수정만으로 해결되지 않았다.
- 새 글쓰기 URL로 이동한 직후의 주소만 성공으로 판단하지 않는다. 로그인·팝업 처리 후 실제 편집 가능한 본문을 확인한다. 본문이 없고 최종 주소가 대상 블로그 홈인 경우에만 새 글쓰기를 최대 3번 재요청한다. 기존 공개 글/편집기 본문에는 이 복구 경로로 쓰지 않는다.
- 진행 단계를 콘솔에 표시하고, 실패 시 URL 및 frame별 본문 구조 개수만 기록한다. 쿠키·본문·인증 토큰은 진단에 수집하지 않는다.
- 테스트 527개 통과, 실패/skip 0. 로컬 Chromium으로 글쓰기→지연된 홈 이동→세 번째 새 글쓰기 성공, 계속 홈으로 돌아오면 종료, 보호된 글에는 이동하지 않음을 검증했다. lint 통과, build 성공(기존 tracing 경고 1개).
- 집 PC 적용 및 실제 로그인 후 stage 확인은 미완료. 사용자가 휴식을 요청하여 추가 로그인/실제 발행은 요구하거나 실행하지 않았다.

## 네이버 본문 탐색 실패 보완 — 2026-10-03 (한국 시간)

- 집 PC 제공 로그: 로그인 후 `NAVER_BODY_EDITOR_NOT_FOUND`, publishedUrl/logNo 없음. 기존 worker는 오류 시 Edge를 닫고, 본문 준비 여부 대신 제목만 보고 frame을 선택했다.
- `.se-content`와 `.se-main-container`를 함께 지원하며, 보이고 실제 편집 가능한 본문이 준비된 iframe을 기다린다. 제목만 있는 frame, 숨겨진/읽기 전용 본문은 선택하지 않는다. 기존 본문 보호와 본문/이미지 순서 검증은 유지한다.
- 실패 시 worker/browser를 유지한다. 발행 단계 진입 전 실패를 명시적으로 기록하고, 이 경우에만 새 사용자 승인으로 재시도할 수 있다. 과거 기록 중 한국 채널의 정확한 본문 탐색 오류만 발행 전 실패로 판별한다. 다른 결과 불명·공개 글은 계속 차단하며 이전 실패 token을 보존한다.
- `npm test`: 526개 통과, 실패/skip 0. Chromium에서 iframe 지연 로딩, 편집용 container, 숨김/읽기 전용 거부, 복구 본문 보호, 이미지 3장 위치 검증. 중복/결과 불명/승인 소비 차단 테스트 통과.
- lint 통과, build 성공. 기존 Turbopack tracing 경고 1개. 집 PC 실제 SmartEditor의 새 stage 및 실패 창 유지 동작은 아직 확인하지 못했다. 실제 발행은 실행하지 않았다.

## 끊긴 세션 이후 재개 검증 — 2026-10-03 (한국 시간)

- 새 세션의 작업 폴더는 비어 있었지만 `/workspace/scratch/259d89efa34d/atlas`에서 이전 복제본을 찾았다. 최초 branch/status/diff 확인 결과 `fix/naver-rss-dedupe`, HEAD `d6731903f20d1e2dfd83ed158e6b65c9dfc4f5cb`, 미커밋 변경 없음이었다. 아래 기존 보강을 다시 구현하지 않았다. 집 PC의 미커밋 변경이나 중단된 채팅의 상태는 직접 확인할 수 없다.
- 추가 수정: 조회 시각이 누락·오류·미래이거나 24시간 이상 지난 캐시는 이슈/제품/참고 글을 최신 후보로 반환하지 않는다. HTTP 성공이어도 RSS 대신 HTML 오류 페이지를 받으면 공급자 연결 실패로 기록한다. 정상 빈 RSS는 연결 성공/후보 없음으로 구분한다.
- `ATLAS_NAVER_BROWSER_PATH=/tmp/chromium npm test`: 524개 통과, 실패/skip 0. 새 테스트는 임시 폴더와 mock HTTP 응답으로 시각 오류, 이전 성공 후 조회 실패, 잘못된 RSS, 정상 빈 RSS를 확인한다.
- `npm run lint`: 오류/경고 0. `npm run build`: 성공, 기존 Turbopack 파일 tracing 경고 1개. 실행 도구의 npm http-proxy 설정 경고와 Node module-type 경고는 별도로 남는다.
- `ATLAS_NAVER_BROWSER_PATH=/tmp/chromium npm run workflow:verify`: 국내/해외 dry-run, 검수/승인 gate, 수정 시 승인 해제, localhost:3002 양 채널 UI, 이미지 anchor, 검수 HTML 다운로드 통과. 브라우저 예외 0, 실제 publisher 호출 0. agent-browser CLI가 없어 기존 Playwright Chromium 검사로 확인했다.
- 화면 캡처는 테스트용 작은 PNG를 사용하며 이 Linux 환경에는 한글 글꼴이 없어 한글이 네모로 표시된다. 실제 장면 이미지의 시각 품질이나 집 PC의 글꼴·로그인·네이버 실제 에디터를 검증한 결과는 아니다.
- 이번 추가 변경 파일: `lib/atlas/operate/topic-research.js`, `lib/atlas/operate/topic-research.test.mjs`, 이 문서. 실제 발행·공개 글 변경·push 없음. 아래 실제 환경 검증과 기존 주제/제품 목록 연결 범위의 제약은 그대로 남는다.

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

## Simple operating flow (2026-10-03)

- Reduced the visible rail to topic → production → review → publish. Production has one button; completed writing and images are preserved. Missing-image requests explicitly use `force: false` and the selected record ID. Failure remains visible and retryable.
- Scene regeneration and existing-publication lists are collapsed initially. Full article/image preview, review receipt, editor staging, and explicit publish approval remain accessible with the original blocking rules.
- `npm test`: 533 passed, zero failures/skips with a configured local Chromium executable. `npm run lint`: passed.
- `npm run workflow:verify`: localhost:3002 passed for both channels, three separate preview anchors, embedded review download, staging-only request, disabled publication, and failed missing-image retry without rewriting or approval. All publisher calls were zero. Test images are synthetic; this is functional browser verification, not face or real-artwork review. The cloud test browser lacks Korean fonts, so screenshot typography is not verified.
- Home Windows/Edge is unavailable from this session. Applying the branch to the home checkout and real logged-in Naver staging/publication remain unverified. No existing public post was modified.

## Local update and launch (2026-10-04 Korea)

`ATLAS-UPDATE.cmd` checks port 3002, updates only `nohseungho/atlas` on `fix/naver-rss-dedupe`, then calls the existing `ATLAS.cmd`. A running server is left untouched; close its launcher before updating. Edge login profiles are not stopped or altered. Publication is never invoked.

The updater preserves home-only commits by a regular merge, rejects unfinished Git operations, checks overlapping uncommitted/untracked paths (including Korean names), and preflights committed conflicts with `git merge-tree --write-tree` before altering working files. Conflicts stop the update without reset, stash, auto-commit, or conflict resolution. Git supporting `merge-tree --write-tree` is required. Dependencies are installed only after a changed manifest, missing Next, or a previously interrupted installation; pending installation is recorded locally for retry.

The launcher stamps its starting Git revision and tracked-change flag into the process. The operating screen displays that basis; it does not claim the Git revision proves uncommitted files or hot reload are identical. Older/manual launches without metadata explicitly show an unknown version.

Validation: five real disposable Git repository tests pass for dirty drafts/images, diverged home commits, committed conflicts, overlapping untracked assets, foreign remotes, wrong branches and unfinished merges. Full suite: 538 passed, zero failed/skipped. Lint passed. Browser workflow on localhost:3002 passed including revision display, dirty flag, and updater refusal while the server runs. Both channels, approval gates, preview anchors and retry behavior also pass; publisher calls remain zero.

Windows CMD/PowerShell execution and real home Edge staging remain unverified because the home PC is not connected to this execution environment. This change is available on the operating branch; the first home application still requires pulling that branch, after which double-clicking `ATLAS-UPDATE.cmd` replaces repeated pull/start commands. Public content was not changed.

### Home merge retry correction (2026-10-04 Korea)

A home report exposed a false overlap: after merging the upstream branch, its saved home draft differed from the upstream snapshot, and a later draft edit caused the updater to block even though the remote was already included. The updater now detects an incoming ancestor as already applied. For genuinely new commits, it compares home HEAD with the preflight merge-result tree, so home-only saved data is not mistaken for incoming changes. Real pending conflicts remain blocked.

Two regression tests reproduce both cases with committed home drafts followed by uncommitted edits. Full suite: 540 passed, no failures/skips; lint and build passed (existing Turbopack warning remains). No UI or browser publisher changed; the prior localhost browser verification still applies to those unchanged flows. Home Windows execution/publication remains unverified, and no public post was altered.

### Inactive blank Naver body correction (2026-10-04 Korea)

The home diagnostic reported a correct PostWriteForm, one se-content, two components/two paragraphs, but zero editable body paragraphs. The adapter previously waited for native editability without first activating the empty body. It now clicks a visible blank body only when navigation supplies the validated who-ami new-post target, then requires genuine native editability. It also supports an editable descendant inside a noneditable paragraph, including a zero-width empty inline span that still has a visible caret line. It never sets contenteditable, types probes or clicks publication controls.

Activation is bounded to three attempts per frame. Existing posts/logNo, wrong-blog or update URLs, hidden inputs and restored nonempty bodies remain protected. Expanded diagnostics report body paragraph/editable descendant counts and active element tag/classes/editability without recording prose, credentials or cookies.

A routed Chromium regression starts with two noneditable paragraphs, activates the body by click, inserts and verifies real text, and checks that protected/public/restored/read-only content is untouched. Full suite: 541 passed, zero failures/skips. Lint and build passed; existing Turbopack warning remains. Localhost:3002 workflow verification passed for both channels, staging-only requests, image placement, approval gate and retry behavior; real publisher calls remain zero. Real Naver activation must still be verified on the home PC; this is a tested recovery path, not a claim that the unavailable live Naver DOM is fixed. The submitted diagnostic timestamp was 2026-10-03T16:24:54.542Z, so newer attempts must be compared separately.
