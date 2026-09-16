# 통합 상품 선택과 신규 발행

`/atlas/unified-publish`에서 오늘 자료 업데이트 → 채널별 5개 슬롯 → 상품 선택 → 원고 저장 → 다섯 항목 점검 승인 → 신규 발행 순서로 사용한다. 선택한 상품의 원고와 쇼츠 제작자료는 `.atlas-data/unified/state.json`에 저장한다. 이 디렉터리는 Git에서 제외된다.

## 무료 근거

- 국내: https://www.ppomppu.co.kr/rss.php?id=ppomppu
- 해외: https://www.dealnews.com/?rss=1
- DealNews 공식 RSS 안내: https://www.dealnews.com/pages/rss.html

최근 72시간 이내 게시물만 출처 순서로 최대 5개 표시한다. 이는 판매량이나 가성비의 시장 전체 순위가 아니다. 제목에 기재된 가격과 사양, 피드 카테고리만 사용한다. 확인 불가한 가격·사양은 미확인으로 표시한다. DealNews 출처 링크의 referral 파라미터는 그대로 보존한다. 피드 실패 시 빈 슬롯과 오류를 표시하며 예시 상품으로 대체하지 않는다. 확인 시각이 24시간을 넘은 원고는 승인·발행할 수 없다.

## 기존 기능 재사용

- 국내: 기존 `runNaverBrowserJob`, `PostWriteForm`, 기존 Edge의 `ATLAS_NAVER_PROFILE_DIR` 또는 기본 `~/.atlas/naver-profile`을 사용한다. 새 로그인 프로필이나 쿠키 복사본을 만들지 않는다.
- 해외: 기존 Blogger OAuth 저장소와 `bloggerProvider.publish`의 신규 insert만 사용한다. 업데이트·PATCH 경로는 호출하지 않는다.
- 쇼츠: 같은 상품 ID·출처·확인시각·캐릭터를 기존 PhotoCardStudio의 상품 저장소로 전달한다. 제작자료까지만 준비하며 영상 렌더링·업로드는 하지 않는다.
- 국내 수호 마스터는 로컬 파일로 업로드한다. 해외 이미지는 기존 Cloudinary `atlas/articles`의 미지 이미지 URL을 입력하고 직접 확인해야 한다. 유료 이미지 생성·새 API 키·유료 AI 호출은 없다.

## 발행 보호

승인은 제목·본문·이미지·고지·링크·근거의 해시에 묶인다. 수정하면 승인이 해제된다. `validateChannelIdentity` 및 `assertNaverWriteTarget`을 사용하고, 모든 기존 글 ID 및 발행 이력이 있는 상품의 재발행을 차단한다. Naver `224407589323`은 결과 URL에서도 거부한다. Blogger는 실제 공개 글 목록과 제목·근거 링크의 중복도 확인한다.

발행 요청 전에 `publishing`을 원자적으로 기록한다. 성공 URL과 글 ID는 채널별로 저장한다. 응답 유실·로그인 오류 등을 포함한 발행 실패는 `needs_reconciliation`으로 잠가 자동 재시도를 하지 않는다. 한 채널의 실패가 다른 채널의 URL을 지우지 않는다. 잠긴 작업은 실제 채널 글 목록과 대조하기 전 새 글로 재생성해서는 안 된다. 자동 결과 대조·잠금 해제 UI는 아직 없다.

프로세스가 저장 잠금을 보유한 채 종료되면 `write.lock`을 자동 제거하지 않는다. 실행 중인 작업과 실제 발행 결과를 확인한 뒤 운영자가 복구해야 한다. 이 파일 기반 저장 방식은 한 PC에서의 운영용이다.

## 검증

`npm run unified:verify`, 변경 파일 ESLint, `npm run build`를 실행한다. 브라우저 검증 중 실제 발행 버튼은 누르지 않는다. 테스트는 실제 외부 게시를 생성하지 않는다.
