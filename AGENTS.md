<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## ATLAS character and channel lock

- `lib/atlas/character-channel-policy.js` is the only source of truth for recurring characters and channel asset namespaces.
- Global English Blogger content always uses Miji and `ATLAS-MIJI-MASTER.png`.
- Korean Naver `who-ami` content always uses Suho and `ATLAS-SUO-MASTER.png`.
- Never mix global Blogger assets with Korean Naver assets.
- Naver post `224407589323` is immutable. New multitap content must use `PostWriteForm` with an empty `logNo`.
- Do not bypass `validateChannelIdentity` or `assertNaverWriteTarget` in generation, staging, QA, or publishing code.
