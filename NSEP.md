# NSEP v1.3
## NOVA Safe Execution Protocol + Claude Code Optimization

**v1.3 변경**: 작업 중 SAFE/CAUTION/WARNING 블록을 매번 출력하지 않는다.
권한 승인은 Claude Code 자체 프롬프트가 처리한다. 파일 수정/테스트는 바로
진행하고, 작업이 모두 끝난 뒤 한 번에 보고한다: 변경 파일 / 구현 내용 /
테스트 결과 / git status. 위험 명령(3장)과 Commit 승인(6장)만 예외로
사전 확인을 유지한다.

모든 프로젝트 공통 개발 표준. (이 세션에서는 ATLAS에만 적용/유지)

적용 프로젝트: Safety Monitor, Story Shorts AI, NOVA HQ, PICK UP, ATLAS

---

## 목표

1. 프로젝트 오염 방지
2. 위험한 명령 방지
3. 사용자가 Bash를 해석하지 않아도 되도록 한다
4. 토큰 최소 사용
5. 항상 하나의 최종안만 제안

---

## 1. 실행 규칙

모든 Bash/PowerShell 실행 전 아래 형식만 출력한다. "지금 하는 일"을 가장 먼저
보여준다 (Project/Path/Reason보다 우선). 사용자는 명령어가 아니라 '행동'을
승인한다.

```
🟢 SAFE
프로젝트: 현재 프로젝트
지금 하는 일: (행동 설명)
파일 변경: 있음 / 없음
사용자 행동: YES 누르면 됨
```

```
🟡 CAUTION
프로젝트: 현재 프로젝트
지금 하는 일: (행동 설명)
영향: (설정, 의존성 등)
사용자 행동: 확인 후 YES
```

```
🔴 WARNING
프로젝트: 현재 프로젝트
지금 하는 일: (행동 설명)
영향: (위험 내용)
사용자 행동: STOP
```

- 🟢 SAFE: 승인 대기 없이 즉시 실행
- 🟡 CAUTION: 사용자 확인 후 실행
- 🔴 WARNING: 사용자 승인 전까지 절대 실행하지 않음

## 2. SAFE 기준

`npm run *`, localhost 테스트, `eslint`, `node`, `curl localhost`,
개발 서버 시작/종료, 현재 프로젝트 내부 파일 생성/수정/테스트

## 3. CAUTION 기준

`package.json` 변경, `npm install`, 설정파일 변경, 의존성 변경

## 4. WARNING 기준

다른 프로젝트 접근, 삭제 작업, `git reset --hard`, `git clean`, `git rebase`,
시스템 폴더 접근, 환경변수 변경, Global 설정 변경

## 5. 프로젝트 격리

현재 프로젝트(`D:\projects\atlas`) 외에는 절대 수정하지 않는다.
다른 프로젝트 경로 포함 시 반드시 🔴 WARNING.

## 6. Commit 규칙

커밋 전 반드시 출력: Modified/New/Deleted Files, `git status`, 추천 Commit Message
→ 사용자 승인 → Commit. 승인 없이 Commit 금지.

## 7. 파일 읽기 범위

작업마다 프로젝트 전체를 재분석하지 않는다. 현재 작업과 직접 관련된 파일만
읽고 수정한다 (예: Publisher 작업 → `app/publisher/page.js`,
`lib/html-exporter.js`, 관련 data 파일만).

## 8. 응답 형식

항상 한국어. 불필요한 설명, 반복 설명, 긴 보고 금지. 작업 완료 후에는 다음만
보고한다: 완료 내용 / 변경 파일 / 실행 결과 / `git status` / 추천 Commit Message.

## 6. 개발 방식

기능을 생각날 때마다 추가하지 않는다.
① 방법 3개 이상 내부 비교 → ② 장단점 분석 → ③ 최종안 1개 선택 → ④ 이유 설명
→ ⑤ 사용자 승인 → ⑥ 개발

## 7. 응답 규칙

한국어 사용, 영문 최소화, 불필요한 설명 금지, 반복 금지, 핵심만 설명,
코드 필요 시 코드만 출력, 토큰 최소 사용

## 8. AI 검증 규칙

새로운 규칙/구조/아키텍처/개발 방식 제안 시 다른 AI(Claude, ChatGPT, Gemini)로
검증 가능한 형태인지 검토하고, 필요하면 공통 검증 프롬프트 제공

## 9. 최우선 원칙

사용자를 놀라게 하지 않는다 → 먼저 설명 → 승인 → 실행
안전 > 프로젝트, 수익 > 기능, 구조 > 속도
