# Devpost submission draft

**Title:** Cast the Party

**Tagline (≤ 200 chars):** A costume fitting for every murder-mystery guest: their character's look on their own face with YouCam, a tag showing which pieces actually showed up, and what to buy.

**Demo link:** https://cast-the-party.onrender.com/ (Render free plan: the first load after a quiet spell can take about a minute while the server wakes) · **Video:** https://www.youtube.com/watch?v=kzSRZW_w3m8 · **Code:** https://github.com/ai-q-labs/cast-the-party

---

## Inspiration

We make printable murder-mystery party kits. Every kit hands each guest a character and asks them to come dressed for it. (The six characters in this demo, from a 1920s night editor to a snowbound station master, were written for the demo in the same style.) The weak point is always the same: a character sheet can say "ink-black bob, berry lip, pearl drops, newsboy cap", but it can't tell a guest whether that works on *their* face, or which of those four things they actually need to buy. So people guess, or they don't bother.

Virtual try-on answers the first question. We wanted to answer the second one honestly too.

## What it does

The host picks one of six original characters. The guest adds a photo (with a consent tick) or uses an AI-generated demo face. The app renders the character's look on that face with YouCam, layer by layer: hairstyle, hair colour, makeup, earrings, and a hat portrait.

The result is a printable **costume tag**:

- a before/after mirror;
- a change map for every layer (the pixels it actually changed);
- a punch card: a piece is punched only if YouCam succeeded *and* it visibly changed the picture;
- a hair-shade check: CIEDE2000 distance from the character's shade, before and after;
- a shopping list where each item is marked *previewed*, *not previewed* or *not in the preview*, with plain search links;
- the units the render used, and "AI-rendered preview, not a photo".

On our six example tags the shade check did real work: ink black moved from 21.0 to 7.5, but platinum on dark hair went from 77.0 only to 59.8 (it came out olive), so that guest knows to buy a wig; and on a model whose hair was already near coal, the colour layer moved it *away* (3.0 → 8.1), so that piece can be skipped.

## How we built it

- **Node.js with zero dependencies**: the server holds the YouCam key, runs the layers and serves the page. The key goes only to the YouCam API host; uploads and downloads to the storage host carry no key.
- **YouCam APIs**: File upload; Hairstyle (template), Hair Color (custom hex palette), Makeup VTO (lip colour, eyeliner, brows, blush; skin smoothing off so the measurement shows the makeup), Earrings 2D VTO (product photo), Hat VTO (product photo, gender and style). Each layer runs on the previous layer's result URL; a failed layer is skipped and the next starts from the last good image.
- **YouCam image generator** made the three demo faces and the seven hat and earring product photos, so no real person's photo and no real product ships with the app.
- **Measurements in the browser** (`public/measure.js`): changed-pixel masks, coverage, CIELAB medians and CIEDE2000, verified against the Sharma, Wu & Dalal test pairs.
- **Caps for a public demo**: per-visitor renders, a daily unit budget and a concurrency limit, all configurable. A render reserves its planned cost and settles to the units actually counted.
- **35 tests** with `node --test` (YouCam mocked), plus one opt-in live test. During development we logged every unit spent from the account balance before and after (`_dev_units.log`); the app's own count matched the balance on every render.

## Challenges we ran into

- **The hat engine is a different kind of tool.** It doesn't put a hat on your photo; it re-composes you in a new outfit and scene. We moved it to the end of the chain, show it as a separate portrait, and label it plainly instead of pretending it's part of the face card.
- **"Success" isn't the same as "it shows".** A task can succeed and change almost nothing. We made the punch card depend on measured pixel change, and calibrated the threshold on real renders (makeup alone: 1.05% at 24/255 vs 1.70% at 12/255, which is compression noise).
- **Formats.** The hairstyle engine takes only JPEG up to 1024 px, while hair colour, makeup and earrings return PNG. The page resizes and re-encodes uploads; the server checks JPEG dimensions before spending a unit.
- **Spending real units in public.** Judges and visitors spend from one account, so the demo caps itself and the example tags work with no spend at all.

## Accomplishments that we're proud of

- A measurement that can contradict what the preview seems to promise, and does when it should (platinum, coal).
- Five YouCam try-on features chained on one face, with one failure never costing the whole card.
- Nothing about a guest is written to disk, and every picture is labelled as an AI-rendered preview.

## What we learned

- Light shades on dark hair don't reach the target in one pass; measuring it was more useful than tuning around it.
- Telling people what a tool can't do (the hat engine's invented outfit, the shade that fell short) makes the rest of the card easier to trust.

## What's next

- Put the fitting link inside our party kits, so hosts can send each guest their character with a "try your look" button.
- Let hosts add their own characters (pick templates, shades and props) and print a tag for the whole table.
- A cheaper "colour only" fitting for large parties, and a necklace layer for characters that need one.

## Built with

`node.js` · `javascript` · `html5` · `css3` · `youcam-api` (File, AI Hairstyle, AI Hair Color, AI Makeup VTO, AI Earrings VTO, AI Hat VTO, AI Image Generator) · `canvas` · `cielab` · `ciede2000` · `render`

**AI disclosure:** this app was built with AI assistance; most of the code, copy and character writing were produced with Claude (Anthropic). The demo faces and prop photos are AI-generated with YouCam.
