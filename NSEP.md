# NSEP v1.0
## NOVA Safe Execution Protocol + Claude Code Optimization

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

## 1. Bash / PowerShell 실행 규칙

모든 명령 실행 전 아래 형식만 출력 (설명은 최대 5줄 이내).

```
🟢 SAFE
프로젝트:
경로:
작업:
영향 파일:
추천: YES
```

```
🟡 CAUTION
프로젝트:
경로:
작업:
위험 요소:
추천: USER CHECK
```

```
🔴 WARNING
프로젝트:
경로:
작업:
위험 요소:
추천: STOP (사용자 승인 전에는 실행하지 않는다)
```

## 2. 프로젝트 격리

현재 프로젝트(`D:\projects\atlas`) 외에는 절대 수정하지 않는다.
다른 프로젝트 경로 포함 시 반드시 🔴 WARNING.

## 3. 위험 명령 (항상 🔴 WARNING)

`git reset --hard`, `git clean`, `git rebase`, `git branch -D`, `rm`, `rm -rf`,
`del`, `Remove-Item`, `rmdir`, 환경변수 변경, Global npm, 시스템 폴더 접근

## 4. Commit 규칙

커밋 전 반드시 출력: Modified/New/Deleted Files, `git status`, 추천 Commit Message
→ 사용자 승인 → Commit. 승인 없이 Commit 금지.

## 5. SAFE 작업

`npm run *`, `node`, `curl localhost`, `mkdir`, `eslint`, 빌드, 테스트,
프로젝트 내부 파일 생성/수정

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
