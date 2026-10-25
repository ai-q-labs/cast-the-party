# Cast the Party

**A costume fitting for every murder-mystery guest: their character's look rendered on their own face with YouCam, a tag that shows which pieces actually showed up, and a shopping list for the rest.**

Built for the YouCam API Skin AI & eCommerce VTO Hackathon (2026). Node 20+ · zero dependencies · MIT.

**Try it:** https://cast-the-party.onrender.com/ · **Demo video (1:56):** https://www.youtube.com/watch?v=kzSRZW_w3m8

The demo runs on Render's free plan, which puts the server to sleep after 15 minutes without visitors. If the first page load hangs, it is waking up: give it about a minute (on 2026-10-24 it took 22 seconds). The six example tags open without spending anything; a live render is capped per visitor and per day (see [Limits and caps](#limits-and-caps)).

## The problem

We make printable murder-mystery party kits (Ai-Q Labs, sold on BOOTH, itch.io and Etsy). In every kit, each guest is handed a character, and the host asks everyone to come dressed for the part. The usual failure: guests don't know what the part looks like on *them*, buying costume pieces online is guesswork, and half the table turns up in street clothes.

A character sheet that says "ink-black bob, berry lip, pearl drops, newsboy cap" doesn't answer the guest's real question, which is *will that work on my face, and which of those things do I actually need to buy?*

## What it does

1. **The host picks a character.** Six original looks, each a short stack of YouCam layers.
2. **The guest adds a photo** (or uses one of three AI-generated demo faces). Uploads need an explicit consent tick.
3. **YouCam renders the look on the guest's own face**, layer by layer: hairstyle, hair colour, makeup, earrings, and a separate hat portrait.
4. **The guest gets a costume tag**:
   - before/after on a draggable divider;
   - for each layer, a change map: the pixels that layer actually changed, painted pink, with the share of the picture;
   - a punch card: one hole per piece of the look, punched only if that piece visibly showed up on this face;
   - a hair-shade check: how far the hair moved toward the character's shade, measured, not assumed;
   - the shopping list, each item marked *previewed*, *not previewed* or *not in the preview*, with plain search links (no affiliate tags);
   - the honest footer: "AI-rendered preview, not a photo", and the YouCam units the render used.
5. **Print the tag** and hand it out with the character sheet.

Every tag can also be opened as an **example** (rendered earlier on an AI-generated face) without spending any units.

## Which YouCam APIs, and why

| Layer | Endpoint | Why this API | Units |
|---|---|---|---|
| Hairstyle | `POST /s2s/v2.0/task/hair-style` (template) | The hairstyle sets the period of the look. Each character has one template from YouCam's "female" set and one from its "male" set; the guest picks either. | 1 |
| Hair colour | `POST /s2s/v2.0/task/hair-color` (`pattern: full`, custom hex palette) | A custom hex lets each character name an exact shade, which the tag then checks. | 1 |
| Makeup | `POST /s2s/v2.0/task/makeup-vto` (`lip_color`, `eye_liner`, `eyebrows`, `blush`) | Period looks live in the lip and brow. Skin smoothing is switched off so the measurement shows the makeup, not a filter. | 1 |
| Earrings | `POST /s2s/v2.0/task/2d-vto/earring` | The preview shows the earring at scale on the guest's own face. | 1 |
| Hat | `POST /s2s/v2.0/task/hat` (product photo + gender + style) | Four of the six characters are defined partly by a hat. This engine re-composes the whole picture, so it runs last and is shown as a separate portrait. | 2 |
| File | `POST /s2s/v2.0/file` | The guest photo and the product photos are uploaded once; every later layer runs on the previous layer's result URL. | 0 |
| Image generator | `POST /s2s/v2.0/task/text-to-image/youcam` | Used while building, not at run time: the three demo faces and the seven hat and earring product photos are YouCam-generated. | 1 each |

Unit prices are the ones `GET /s2s/v2.0/credit/feature-cost` returned on 2026-10-24. The layers chain: the hairstyle runs on the uploaded file id, and each later layer runs on the previous layer's result URL. A layer that fails is recorded and skipped, and the next one starts from the last good image, so a missing earring does not cost the guest the whole card.

## The measurements, and how they are computed

All of it is in [`public/measure.js`](public/measure.js): pure functions over pixel arrays, run in the browser on the images shown, and in the tests on hand-made arrays.

- **Changed area.** For each face-card layer, the image that went into YouCam and the one that came back are drawn at the same size (384 px wide), and every pixel where some colour channel moved by at least 24 of 255 is marked. Below that is mostly compression noise: on our first test render, a makeup-only step measured 1.05% at a threshold of 24 and 1.70% at 12, with the face itself unchanged.
- **Showed up (the punch).** A layer is punched only if YouCam reported success **and** at least 0.05% of the picture changed. A "success" that changed nothing visible is not counted. The hat portrait is a new composition (outfit, background, framing all change), so it cannot be compared pixel for pixel; it is punched on YouCam's success alone, and the tag says so.
- **Coverage** = punched pieces / planned pieces.
- **Hair shade.** On the pixels the hair-colour layer changed, the median colour in CIELAB before and after is compared with the character's shade using CIEDE2000 (implementation checked against the published Sharma, Wu & Dalal test pairs). Real hair has highlights and shadow, so 0 is not expected; the point is how far it moved.

**Measured on our six example tags** (AI-generated demo faces; values from `measure.js` on pixels decoded with Pillow at 384×512, so a browser may differ in the last digit):

| Character | Coverage | Hair shade (ΔE00 to target, before → after) |
|---|---|---|
| The Night Editor (ink black `#1B1717`) | 5 of 5 | 21.0 → 7.5 |
| The Hot-Spring Inn Keeper (dark espresso `#2B1D16`) | 3 of 3 | 9.3 → 4.3 |
| The Lighthouse Keeper (salt grey `#8C8B87`) | 3 of 3 | 39.7 → 32.0 |
| The Supper-Club Singer (platinum `#E3D3A8`) | 4 of 4 | 77.0 → 59.8 |
| The Greenhouse Botanist (copper `#A0461E`) | 5 of 5 | 36.7 → 18.4 |
| The Station Master (coal `#2E2A28`) | 3 of 3 | 3.0 → 8.1 |

Two of these are the reason the check exists. The singer's platinum came out olive-khaki on dark hair: it moved 17 points but stayed far from platinum, which tells that guest to budget for a wig or spray rather than trust the preview. The station master's model already had near-coal hair, and the colour layer moved it *away* (3.0 → 8.1); the tag says the guest can skip that piece.

## Run it

```sh
node --version          # 20 or later
export YOUCAM_API_KEY=...   # PowerShell: $env:YOUCAM_API_KEY="..."
npm start               # http://localhost:3000
npm test                # 35 tests, no network (the live one is skipped)
```

Without a key the page and the six example tags still work; live renders are switched off. The key is read from `YOUCAM_API_KEY`, or from `api_key.txt` in `YOUCAM_SECRETS_DIR` (default `~/.secrets/youcam/`). It stays on the server: it is never logged, never written by the app, and never sent to the browser. Calls to the storage host (photo upload, result download) carry no key.

**Replit:** import the repo, put the key in Secrets as `YOUCAM_API_KEY`, and press Run (`npm start`; the port comes from `PORT`).

**Live test (spends 1 unit):** `YOUCAM_LIVE_TEST=1 npm run test:live` renders one hairstyle on demo face A.

## Limits and caps

Every live render spends real units from one YouCam account, so the public demo caps itself (all configurable):

| Variable | Default | What it limits |
|---|---|---|
| `RENDERS_PER_VISITOR` | 3 | renders one visitor (by IP) may start per UTC day; a courtesy, not a security boundary |
| `DAILY_UNIT_CAP` | 150 | units the whole demo may spend per UTC day; the hard limit |
| `MAX_CONCURRENT` | 2 | renders running at once |
| `LIVE_RENDERS=off` | — | serve the page without spending anything |

A render reserves its full planned cost before it starts; when it ends, the reservation is replaced by the units actually counted. A task YouCam accepted and then failed is counted (it may have been charged); a request refused before a task existed is not. In development the count matched the account balance on every render (see `_dev_units.log`).

Other limits, plainly:

- The hairstyle engine accepts JPEG up to 1024 px with a near-frontal face; the page resizes uploads, but strongly turned heads will be refused by YouCam.
- The hat engine invents an outfit and a background and can drift the face. The tag labels it and does not measure it.
- Earrings are mirrored onto both ears by YouCam when the reference shows one earring.
- Coverage says a piece *visibly changed the picture*; it does not judge whether the change looks good. The change maps are there so a person can.
- Light shades on dark hair (platinum, salt grey) do not reach the target in one pass; the shade check reports that rather than hiding it.

## Privacy

- An uploaded photo is sent only after the consent tick, which also confirms the person in it is 13 or older. The app is for party hosts and guests; it asks for no account, name or email.
- Uploaded photos and results stay in the server's memory for at most 15 minutes (so the browser can fetch them), are never written to disk, and are not logged.
- They are sent to Perfect Corp.'s YouCam API, which deletes uploaded and generated files after 30 days ([File Retention Period](https://docs.perfectcorp.com/develop/file_retention_period)).
- The demo faces are AI-generated people who do not exist (YouCam image generator, `youcam-image-v2`). The hat and earring product photos are AI-generated too. No photo of a real person ships with the app.

## Project layout

```
server.js               entry: reads the key, sets the caps, listens on PORT
src/youcam.js           YouCam client: upload, run + poll, download (key only to the API host)
src/plan.js             a character look -> YouCam request bodies
src/pipeline.js         runs the layers in order, skips failures, uploads props once
src/limits.js           per-visitor, daily-unit and concurrency caps
src/app.js              HTTP routes, photo checks, in-memory jobs, static files
public/characters.js    the six looks (read by both server and page)
public/measure.js       change area, coverage, CIEDE2000 shade check
public/app.js           the page: fitting form, progress, the costume tag
public/tour.js          the narrated tour used for the demo video (open the page with ?tour=1)
public/examples/        six example tags rendered on the demo faces
scripts/                build-time tools (probe, paid dev runner, example renders)
test/                   node --test, YouCam mocked; live.test.mjs is opt-in
_dev_units.log          every unit spent while building, from the account balance
```

## Credits and disclosure

- Built by Ai-Q Labs with AI assistance: most of the code, the copy and the character writing were produced with Claude (Anthropic).
- Characters, settings and props are original and fictional; no real people, brands or venues.
- Fonts: Big Shoulders Display, Atkinson Hyperlegible, IBM Plex Mono, all under the SIL Open Font License (texts in `public/fonts/`).
- YouCam API by Perfect Corp. This project is not affiliated with Perfect Corp.

## License

MIT. See [LICENSE](LICENSE).
