// Narrated tour for the demo video. Open the page with ?tour=1 and press Start tour.
// It drives the real page in this browser: one live YouCam render of the Night
// Editor on demo face A (6 units), then an example tag that costs nothing.
// If no live render is possible, it shows the Night Editor's example tag instead.

const $ = (sel) => document.querySelector(sel);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function until(test, timeout = 30000, step = 250) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const v = test();
    if (v) return v;
    await sleep(step);
  }
  return null;
}

let voice = null;
function pickVoice() {
  const vs = speechSynthesis.getVoices();
  voice = vs.find((v) => /Zira/i.test(v.name)) ?? vs.find((v) => v.lang === "en-US" && v.localService) ?? vs.find((v) => v.lang?.startsWith("en")) ?? null;
}

function caption(text) {
  $("#tour-caption").textContent = text;
  $("#tour-caption").hidden = !text;
}

// Speak one sentence. Network voices can stop mid-way on long text and then never
// fire onend, so each sentence is short and has its own time limit.
function speak(sentence) {
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(sentence);
    u.voice = voice;
    u.rate = 1.12;
    const limit = setTimeout(() => {
      speechSynthesis.cancel();
      resolve();
    }, 2000 + sentence.length * 90);
    u.onend = u.onerror = () => {
      clearTimeout(limit);
      resolve();
    };
    speechSynthesis.speak(u);
  });
}

// Speak a line and show it as a caption. Without a voice, wait as long as reading takes.
async function say(text) {
  caption(text);
  if (!voice) return sleep(Math.max(2500, text.length * 65));
  for (const sentence of text.match(/[^.:]+[.:]?/g).map((s) => s.trim()).filter(Boolean)) await speak(sentence);
}

function spot(el) {
  document.querySelectorAll(".tour-spot").forEach((n) => n.classList.remove("tour-spot"));
  el?.classList.add("tour-spot");
  el?.scrollIntoView({ block: "center", behavior: "smooth" });
}

const tagName = () => $("#tag-slot .tag-name")?.textContent;
const inTag = (sel) => $(`#tag-slot ${sel}`);

// Move the before/after divider the way a hand would.
async function sweep(to, ms) {
  const slider = inTag('input[type="range"]');
  if (!slider) return;
  const from = Number(slider.value);
  const steps = Math.max(1, Math.round(ms / 30));
  for (let i = 1; i <= steps; i++) {
    slider.value = String(Math.round(from + ((to - from) * i) / steps));
    slider.dispatchEvent(new Event("input"));
    await sleep(30);
  }
}

async function liveRenderPossible(units) {
  try {
    const c = await (await fetch("api/config")).json();
    return Boolean(c.live && c.caps && c.caps.visitorRendersLeft > 0 && c.caps.dailyUnitCap - c.caps.unitsUsedToday >= units && c.caps.running < c.caps.maxConcurrent);
  } catch {
    return false;
  }
}

const RENDER_LINES = [
  "This is a live render on the hosted demo. The photo goes up once through YouCam's File API, then five try-on tasks run in a chain.",
  "Each layer starts from the previous layer's result: the bob, ink-black hair, a berry lip and liner, pearl drops, and last a hat portrait.",
  "If a layer fails, it is recorded and skipped, and the next one starts from the last good image.",
  "The API key never leaves the server. Photos stay in memory for fifteen minutes and are never written to disk.",
  "And the public demo caps how many units each visitor, and each day, can spend.",
];

async function run() {
  const t0 = performance.now();
  const mark = (label) => console.log(`[tour] ${label} at ${((performance.now() - t0) / 1000).toFixed(1)}s`);
  document.title = "Cast the Party (tour running)";

  $("#tour-title").hidden = false;
  await until(() => document.querySelectorAll("#playbill .role").length === 6);
  await say("This is Cast the Party: a costume fitting for murder-mystery guests, built on the YouCam API.");
  $("#tour-title").hidden = true;

  spot($(".hero"));
  await say("Every guest at a murder-mystery party plays a character, but nobody knows what the part looks like on their own face, or what to buy.");

  spot($("#playbill"));
  await say("The host picks one of six characters. Each look is a stack of YouCam try-on layers, and the number on each is its cost in units.");
  mark("intro");

  $('.role[data-id="night-editor"] [data-act="fit"]').click();
  await sleep(900);
  $("#faces button").click();
  await until(() => !$("#go").disabled, 5000);
  spot($("#fit-form"));
  await say("Fit a guest as the Night Editor, on an AI-generated demo face.");

  let live = await liveRenderPossible(6);
  if (live) {
    $("#go").click();
    spot($("#progress"));
    const outcome = until(() => (tagName() === "The Night Editor" ? "tag" : $("#error").textContent ? "error" : null), 240000, 300);
    for (const line of RENDER_LINES) await say(line);
    caption("Rendering live with the YouCam API…");
    live = (await outcome) === "tag";
  }
  if (!live) {
    $('.role[data-id="night-editor"] [data-act="example"]').click();
    await until(() => tagName() === "The Night Editor", 15000);
    await say("A live render is not available right now, so this is the same look, rendered earlier on the same face.");
  }
  await sleep(1200);
  mark(live ? "rendered live" : "example instead");

  spot(inTag(".mirror-wrap"));
  await Promise.all([
    say("Here is the printable costume tag: before and after, on the guest's own face."),
    (async () => {
      await sweep(12, 1400);
      await sweep(88, 2000);
      await sweep(50, 900);
    })(),
  ]);

  spot(inTag(".layers-strip"));
  await say("Every layer gets a change map: the page compares the picture going into YouCam with the one coming back, and paints the pixels that moved.");

  spot(inTag(".tag-side"));
  await say("A piece is punched only if YouCam reported success and the picture visibly changed.");
  spot(inTag(".shade"));
  await say("The hair shade is measured too: how far the hair sits from ink black, before and after.");

  spot(inTag(".shopping"));
  await say("The shopping list marks each piece as previewed or not, with plain search links.");
  const portrait = inTag(".portrait");
  if (portrait && !portrait.hidden) {
    spot(portrait);
    await say("YouCam's hat engine redraws the whole person, so the tag shows the hat apart, and says so.");
  }
  mark("tag");

  $('.role[data-id="club-singer"] [data-act="example"]').click();
  await until(() => tagName() === "The Supper-Club Singer", 15000);
  await sleep(900);
  spot(inTag(".shade"));
  await say("This example, rendered earlier at no cost, shows why. Platinum on dark hair came out olive, so the tag tells this guest to budget for a wig.");
  mark("singer");

  spot(null);
  $("#tour-end").hidden = false;
  await say("Five YouCam try-on features on one face, and a tag that says what really showed up. The demo and the code are linked below.");
  caption("");
  mark("end");
  document.title = "Tour finished: stop recording";
}

function setup() {
  const css = document.createElement("link");
  css.rel = "stylesheet";
  css.href = "tour.css";
  document.head.append(css);
  document.body.classList.add("tour-on");
  document.body.insertAdjacentHTML(
    "beforeend",
    `<div id="tour-title" hidden><h1>Cast the Party</h1><p>A costume fitting for every murder-mystery guest</p><p>Built on the YouCam API: hairstyle, hair colour, makeup, earrings, hat</p></div>
     <div id="tour-end" hidden><h1>Cast the Party</h1><ul>
       <li><b>File API</b>: the guest photo and the prop photos, uploaded once</li>
       <li><b>AI Hairstyle, Hair Color, Makeup, Earrings and Hat</b>: chained on one face</li>
       <li><b>Measured in the browser</b>: what changed, what showed up, how close the shade landed</li></ul>
       <p class="url">cast-the-party.onrender.com</p><p class="url">github.com/ai-q-labs/cast-the-party</p></div>
     <div id="tour-caption" hidden></div>
     <button id="tour-start" class="button" type="button">Start tour</button>`,
  );
  pickVoice();
  speechSynthesis.onvoiceschanged = pickVoice;
  $("#tour-start").addEventListener("click", () => {
    $("#tour-start").hidden = true;
    run().catch((err) => caption(`Tour stopped: ${err.message}`));
  });
}

if (new URLSearchParams(location.search).has("tour")) setup();
