# Blogger API 자동 발행 - Publishing Engine 구조 설계 (미구현)

이 문서는 설계안이다. OAuth/Google API 호출, 패키지 설치, WordPress 연동은
포함하지 않는다.

## 목표

Publisher에서 선택한 글을 선택한 채널(blogs.json)로 자동 발행한다. 단일
Blogger 연동이 아니라, 장기적으로 여러 Blogger/WordPress/Medium 등
멀티채널로 확장 가능한 구조를 지금부터 준비한다.

## 핵심 개념: Article과 PublishJob 분리 (이번 작업에서 반영 완료)

- Article = 원본 콘텐츠 1건
- PublishJob = article × channel(blog) 조합의 발행 시도 1건
- 하나의 Article이 여러 채널에 발행되면 PublishJob도 여러 건 생긴다
  (articleId 기준 덮어쓰기 금지)

## 데이터 구조

### blogs.json
`bloggerBlogId` 필드 보유 (Blogger 블로그 고유 ID, 현재는 빈 값).
**주의**: OAuth 토큰/refresh token은 이 파일에 절대 직접 저장하지 않는다.
blog record는 나중에 `tokenRef` 같은 참조 필드만 가지고, 실제 토큰은 별도
Token Store(추후 설계, 암호화 저장)에 둔다.

### publishing.json (이번 작업에서 구조 변경 완료)

```json
{
  "jobs": [
    {
      "id": "job_001",
      "articleId": "art_001",
      "channelId": "blog_002",
      "provider": "blogger",
      "status": "succeeded",
      "attemptCount": 1,
      "maxAttempts": 3,
      "lastError": null,
      "nextRetryAt": null,
      "createdAt": "2026-07-01T00:00:00.000Z",
      "updatedAt": "2026-07-01T00:00:10.000Z",
      "publishedUrl": "https://example.blogspot.com/post.html",
      "externalId": ""
    }
  ],
  "history": [
    {
      "id": "hist_001",
      "jobId": "job_001",
      "articleId": "art_001",
      "channelId": "blog_002",
      "provider": "blogger",
      "status": "queued",
      "message": "Job 생성",
      "error": null,
      "createdAt": "2026-07-01T00:00:00.000Z"
    },
    {
      "id": "hist_002",
      "jobId": "job_001",
      "articleId": "art_001",
      "channelId": "blog_002",
      "provider": "blogger",
      "status": "succeeded",
      "message": "Publisher 수동 발행 완료 처리",
      "error": null,
      "createdAt": "2026-07-01T00:00:10.000Z"
    }
  ]
}
```

`jobs`는 최신 상태, `history`는 append-only 이력 (절대 덮어쓰지 않음).

### PublishJob 상태값

`queued` → `running` → `succeeded` | `failed` → `retrying` → `dead`,
그 외 `auth_required` (인증 만료/취소 시)

## Repository 계층 (이번 작업에서 반영 완료)

`lib/atlas/repositories/publishing-repository.js`가 `publishing.json`의
유일한 접근 경로다. API route는 더 이상 `readJson("publishing.json")`을
직접 호출하지 않는다.

- `getPublishingData()` / `savePublishingData()`
- `createPublishJob({ articleId, channelId, provider, maxAttempts })`
- `updatePublishJobStatus(jobId, updates)`
- `appendPublishHistory({ jobId, articleId, channelId, provider, status, message, error })`
- `getJobsByArticleId(articleId)` / `getJobsByStatus(status)`

## Provider Adapter 인터페이스 (이번 작업에서 뼈대만 반영)

`lib/atlas/providers/publish-provider.js` - 공통 인터페이스 + registry
`lib/atlas/providers/blogger-provider.js` - Blogger용, 현재는 TODO만
(실제 호출 시 `Error` throw, 실사용 금지)

```
{
  key: string,
  publish(job, content, auth) => Promise<{ publishedUrl, externalId }>,
  validateAuth(auth) => Promise<boolean>,
}
```

## 향후 필요한 파일 구조 (아직 미생성)

```
app/api/blogger-auth/route.js     # OAuth 시작/콜백 처리 (추후)
app/api/blogger-publish/route.js  # bloggerProvider.publish 실제 연결 (추후)
lib/atlas/token-store.js          # 암호화된 토큰 저장/조회 (추후)
```

## 예상 흐름 (자동 발행 구현 시점)

1. 운영자가 Blog Manager에서 블로그별 `bloggerBlogId` 입력 + OAuth 연동(추후)
2. Publisher에서 "자동 발행" 클릭 → `createPublishJob()`으로 job 생성(`queued`)
3. job 실행기가 `bloggerProvider.publish(job, content, auth)` 호출
4. 성공 시 `updatePublishJobStatus(job.id, { status: "succeeded", publishedUrl, externalId })`
5. 실패 시 오류 유형에 따라 `retrying` 또는 `dead` 또는 `auth_required`로 전환
6. 기존 articles/keywords 상태 갱신 로직 재사용

## 실제 구현 전 필요한 설정값 (사용자 준비 필요)

- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI`
- 블로그별 `bloggerBlogId`
- 토큰 암호화 키, Token Store 저장 방식 결정

## 금지 범위 (이번 설계/리팩토링에 미포함)

- 실제 OAuth 플로우 구현, Google API 패키지 설치/호출
- Blogger 실제 발행 (bloggerProvider는 TODO만)
- Token Store 실제 구현 (평문/암호화 어느 쪽도 아직 없음)
- 큐/스케줄러/재시도 실행기 구현 (Job 스키마만 준비됨)
- WordPress 등 추가 provider
