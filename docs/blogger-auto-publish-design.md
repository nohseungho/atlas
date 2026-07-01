# Blogger API 자동 발행 - 1차 설계 (미구현)

이 문서는 설계안이다. OAuth/Google API 호출, 패키지 설치는 포함하지 않는다.

## 목표

Publisher에서 선택한 글을 선택한 블로그(blogs.json)로 Blogger API를 통해
자동 발행한다. 현재는 수동 복사/붙여넣기 방식이며, 이 설계는 그 다음 단계다.

## 데이터 구조 변경 (이번 작업에서 반영 완료)

- `blogs.json` 각 항목에 `bloggerBlogId` 필드 추가 (Blogger 블로그 고유 ID, 현재는 빈 값)
- Blog Manager 등록 폼에 `bloggerBlogId` 입력란 추가
- Publisher에 "자동 발행 (준비 중)" 버튼 위치만 추가 (비활성, 미구현)

## 향후 필요한 파일 구조 (미생성)

```
app/api/blogger-auth/route.js     # OAuth 시작/콜백 처리 (추후)
app/api/blogger-publish/route.js  # 실제 Blogger API insert 호출 (추후)
lib/blogger-client.js             # Blogger API 호출 래퍼 (추후)
data/atlas/blogger-tokens.json    # 블로그별 refresh token 저장 (추후, git 제외 필요)
```

## 예상 흐름

1. 운영자가 Blog Manager에서 블로그별 `bloggerBlogId` 입력
2. (추후) 블로그별 Google OAuth 연동 → refresh token 발급/저장
3. Publisher에서 "자동 발행" 클릭
4. `app/api/blogger-publish/route.js`가 refresh token으로 access token 갱신
5. Blogger API `posts.insert` 호출 (title, bloggerHtml 전달)
6. 성공 시 기존 `PATCH /api/articles` 로직 재사용해 status=published,
   publishedUrl, publishing.json 기록 자동 처리

## 실제 구현 전 필요한 설정값 (사용자 준비 필요)

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- 블로그별 `bloggerBlogId` (Blogger 블로그 설정 > 기본사항에서 확인 가능)
- refresh token 저장 방식 결정 (로컬 파일 vs 별도 보안 저장소)

## 금지 범위 (이번 설계에 미포함)

- 실제 OAuth 플로우 구현
- Google API 패키지 설치 및 호출
- Publisher "자동 발행" 버튼 활성화
