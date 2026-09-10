# ATLAS KOREA automation

Domestic Naver product-blog automation is isolated on `feat/atlas-korea-product-publisher` so the overseas Blogger pipeline remains unchanged.

## Target flow

1. Choose/create a Korean product draft.
2. Assign Suho or Miji according to category rules.
3. Generate a direct-recommendation draft locally without paid AI calls.
4. Attach body images and, when available, an approved affiliate URL/disclosure.
5. Stage the draft into Naver SmartEditor using a persistent local Edge profile.
6. Stop before public publishing until the draft reaches `approved` state.
7. After explicit final approval, run the actual publish action.
8. Record published URL/time or error state.

## One-click Windows start

Run `scripts\ATLAS-KOREA-START.cmd`. It starts ATLAS on port 3002 and opens:

`http://localhost:3002/atlas/korea`

The first Naver automation run may require one Naver login in the dedicated Edge profile. ATLAS does not store the Naver password. The browser session is reused afterward.

## Safety gates

- Existing overseas Blogger files are not changed by the Korea publisher.
- Existing Naver post updates require a `logNo`.
- The existing multitap article `224407589323` uses `images_only` mode to avoid replacing the full article body.
- A missing affiliate URL never creates a fake CTA.
- Actual Naver publish is rejected unless the draft state is `approved`.
- Duplicate publish is rejected after a draft is recorded as `published`.

## Commands

- `npm run naver:doctor` — local environment/browser check
- `npm run naver:stage -- <draft-id>` — fill Naver editor but do not publish
- `npm run naver:publish -- <draft-id>` — publish only an approved draft

## Current seeded drafts

- Existing multitap article: `kr_multitap_224407589323`
- Philips Series 3000 kettle: `kr_philips_3000_kettle`

Real SmartEditor selector validation must be performed once on the user's local Windows machine because GitHub CI cannot access the authenticated Naver browser session.
