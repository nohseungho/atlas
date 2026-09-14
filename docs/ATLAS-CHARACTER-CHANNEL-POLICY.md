# ATLAS Character & Channel Lock

The executable policy lives in `lib/atlas/character-channel-policy.js`.

| Channel | Platform | Language | Character | Master | Asset namespace |
| --- | --- | --- | --- | --- | --- |
| `global_blogger` | Blogger | English | Miji | `public/atlas/characters/ATLAS-MIJI-MASTER.png` | `atlas/articles` |
| `korea_naver` | Naver `who-ami` | Korean | Suho | `public/atlas/characters/ATLAS-SUO-MASTER.png` | `.atlas-data/korea-assets` |

## Automatic behavior

- Global article creation stamps the Miji identity onto the article and every visual slot.
- A global visual containing a person is generated through the image edit endpoint with the Miji master as its identity reference.
- Korean drafts are normalized to `who-ami`, Suho, and the Korea-only asset namespace.
- Korean zero-cost cards render the Suho master directly; they do not call a paid image API.
- QA and publish routes reject cross-channel assets.
- Re-running a pipeline does not append duplicate identity instructions.

## Immutable Naver target

Naver post `224407589323` cannot be staged, updated, or published by ATLAS. The current multitap workflow is a new-post workflow and must keep `contentType: new_product_review` with an empty `logNo`.
