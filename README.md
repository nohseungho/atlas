This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## ATLAS Quick Start

ATLAS의 공식 로컬 포트는 **3002**로 고정되어 있다. 다른 포트로 자동 전환되지 않는다.

- 시작: `start-atlas.bat` (이미 3002가 실행 중이면 새로 띄우지 않고 브라우저만 연다)
- 종료: `stop-atlas.bat` (3002 포트의 프로세스만 안전하게 종료한다)
- 공식 접속 주소: http://localhost:3002
- Blogger OAuth Callback: http://localhost:3002/api/auth/blogger/callback

Google Cloud Console (OAuth 클라이언트) 등록값:

- 승인된 JavaScript 원본: `http://localhost:3002`
- 승인된 리디렉션 URI: `http://localhost:3002/api/auth/blogger/callback`

포트 3002가 이미 다른 프로세스에서 사용 중이면, 다른 포트로 실행하지 말고 먼저 `stop-atlas.bat`으로 기존 프로세스를 종료한 뒤 다시 시작한다.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

`npm run dev`는 3002 포트로 고정되어 있다 (`package.json`의 `dev` 스크립트 참고).

Open [http://localhost:3002](http://localhost:3002) with your browser to see the result.

You can start editing the page by modifying `app/page.js`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
