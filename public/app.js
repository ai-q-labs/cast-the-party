// Cast the Party: the page. Picks a character and a photo, starts a render on
// the server, follows its progress, and builds the costume tag. Every number on
// the tag is computed here, from the pixels of the images shown (measure.js).

import { CHARACTERS, LAYER_LABELS, UNITS, layersFor, shoppingLinks } from "./characters.js";
import { MIN_AREA, THRESHOLD, changeStats, coverage, overlayFromMask, shadeCheck } from "./measure.js";

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (v !== false && v != null) n.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid != null) n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return n;
};

const FACE_NAMES = { "face-a": "demo face A", "face-b": "demo face B", "face-c": "demo face C" };
const MEASURE_WIDTH = 384;

const state = { config: null, character: null, variant: null, skip: new Set(), photo: null };

/* ---------- start ---------- */

async function init() {
  try {
    state.config = await (await fetch("api/config")).json();
  } catch {
    state.config = { live: false, caps: null, demoFaces: Object.keys(FACE_NAMES), retentionMinutes: 15 };
  }
  $("#ttl").textContent = state.config.retentionMinutes ?? 15;
  renderBudget();
  renderPlaybill();
  renderFaces();
  $("#hero-example").addEventListener("click", () => openExample("night-editor"));
  $("#file").addEventListener("change", onFile);
  $("#consent").addEventListener("change", updateGo);
  $("#fit-form").addEventListener("submit", onSubmit);
}

function renderBudget() {
  const c = state.config.caps;
  const b = $("#budget");
  if (!state.config.live) {
    b.textContent = "Live renders are off on this server. The example tags still work.";
    return;
  }
  b.textContent = `Demo budget today: ${c.unitsUsedToday} of ${c.dailyUnitCap} YouCam units · ${c.visitorRendersLeft} of ${c.perVisitor} live renders left for you`;
}

function renderPlaybill() {
  const root = $("#playbill");
  for (const ch of CHARACTERS) {
    const layers = layersFor(ch);
    const card = el(
      "article",
      { class: "role", "data-id": ch.id },
      el("p", { class: "role-era", text: ch.setting }),
      el("h3", { text: ch.name }),
      el("p", { text: ch.brief }),
      el("p", { class: "look", text: ch.look }),
      el(
        "ul",
        { class: "chips", "aria-label": "Layers and their cost in YouCam units" },
        layers.map((k) => el("li", {}, LAYER_LABELS[k], " ", el("b", { text: UNITS[k] }))),
      ),
      el(
        "p",
        { class: "role-actions" },
        el("button", { class: "button", type: "button", "data-act": "fit" }, "Fit a guest"),
        el("button", { class: "button ghost", type: "button", "data-act": "example" }, "Example tag"),
      ),
    );
    card.addEventListener("click", (e) => {
      const act = e.target.closest("button")?.dataset.act;
      if (act === "fit") selectCharacter(ch.id, true);
      if (act === "example") openExample(ch.id);
    });
    root.append(card);
  }
}

function renderFaces() {
  const root = $("#faces");
  for (const id of state.config.demoFaces || []) {
    const b = el(
      "button",
      { type: "button", "aria-pressed": "false", "aria-label": `Use ${FACE_NAMES[id] || id} (AI-generated person)` },
      el("img", { src: `demo-faces/${id}.jpg`, alt: "", width: 120, height: 160, loading: "lazy" }),
    );
    b.addEventListener("click", () => {
      state.photo = { kind: "demo", id, src: `demo-faces/${id}.jpg` };
      showPreview(state.photo.src, `${FACE_NAMES[id]}, an AI-generated person`);
      for (const x of root.querySelectorAll("button")) x.setAttribute("aria-pressed", String(x === b));
      $("#file").value = "";
      updateGo();
    });
    root.append(b);
  }
}

/* ---------- fitting ---------- */

function selectCharacter(id, scroll) {
  const ch = CHARACTERS.find((c) => c.id === id);
  state.character = ch;
  state.skip.clear();
  for (const card of document.querySelectorAll(".role")) card.setAttribute("aria-current", String(card.dataset.id === id));
  $("#fitting").hidden = false;
  $("#fit-name").textContent = ch.name;

  const variants = $("#variants");
  variants.replaceChildren(
    ...Object.entries(ch.variants).map(([key, v], i) => {
      const input = el("input", { type: "radio", name: "variant", value: key, checked: i === 0 });
      input.addEventListener("change", () => {
        state.variant = key;
        updateGo();
      });
      return el("label", {}, input, `${v.label} `, el("span", { class: "u", text: `(${key} templates)` }));
    }),
  );
  state.variant = Object.keys(ch.variants)[0];

  const layers = $("#layers");
  layers.replaceChildren(
    ...layersFor(ch).map((k) => {
      const input = el("input", { type: "checkbox", value: k, checked: true, disabled: k === "hairstyle" });
      input.addEventListener("change", () => {
        if (input.checked) state.skip.delete(k);
        else state.skip.add(k);
        updateGo();
      });
      const note = k === "hairstyle" ? " (always on)" : "";
      return el("label", {}, input, `${LAYER_LABELS[k]}${note} `, el("span", { class: "u", text: `${UNITS[k]} unit${UNITS[k] > 1 ? "s" : ""}` }));
    }),
  );
  updateGo();
  if (scroll) $("#fitting").scrollIntoView({ block: "start" });
}

function chosenLayers() {
  return layersFor(state.character).filter((k) => k === "hairstyle" || !state.skip.has(k));
}

function showPreview(src, alt) {
  $("#preview").replaceChildren(el("img", { src, alt }));
}

async function onFile(e) {
  const file = e.target.files?.[0];
  $("#error").textContent = "";
  if (!file) return;
  try {
    const dataUrl = await toJpeg(file);
    state.photo = { kind: "upload", dataUrl, src: dataUrl };
    showPreview(dataUrl, "Your photo");
    for (const x of document.querySelectorAll("#faces button")) x.setAttribute("aria-pressed", "false");
  } catch (err) {
    state.photo = null;
    $("#error").textContent = err.message;
  }
  updateGo();
}

// Shrink to at most 1024 px on the long side and re-encode as JPEG: the
// hairstyle engine accepts only JPEG, at most 1024 px.
async function toJpeg(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    if (Math.min(w, h) < 320) throw new Error("That photo is too small: it needs at least 320 pixels on its short side.");
    const c = el("canvas", { width: w, height: h });
    c.getContext("2d").drawImage(img, 0, 0, w, h);
    return c.toDataURL("image/jpeg", 0.9);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function updateGo() {
  const upload = state.photo?.kind === "upload";
  $("#consent-row").hidden = !upload;
  const units = state.character ? chosenLayers().reduce((s, k) => s + UNITS[k], 0) : 0;
  const ready = state.config.live && state.character && state.variant && state.photo && (!upload || $("#consent").checked);
  $("#go").disabled = !ready;
  $("#cost").textContent = !state.config.live
    ? "Live renders are off on this server; open an example tag instead."
    : state.character
      ? `This render will use ${units} YouCam units from the demo's budget.`
      : "";
}

async function onSubmit(e) {
  e.preventDefault();
  const err = $("#error");
  err.textContent = "";
  $("#go").disabled = true;
  const ch = state.character;
  const layers = chosenLayers();
  const body = {
    characterId: ch.id,
    variant: state.variant,
    skip: [...state.skip],
    photo: state.photo.kind === "demo" ? `demo:${state.photo.id}` : state.photo.dataUrl,
    consent: state.photo.kind === "upload" ? $("#consent").checked : false,
  };
  drawProgress(layers.map((kind) => ({ kind, status: "waiting" })));
  try {
    const res = await fetch("api/render", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const out = await res.json();
    if (!res.ok) throw new Error(out.error || "The render could not start.");
    const job = await follow(out.id);
    if (job.state === "failed") throw new Error(job.error || "The render failed.");
    await buildTag({
      character: ch,
      variant: state.variant,
      who: state.photo.kind === "demo" ? `Fitted on ${FACE_NAMES[state.photo.id]} (an AI-generated person)` : "Fitted on your photo",
      beforeSrc: state.photo.src,
      steps: job.steps.map((s) => ({ ...s, src: s.image })),
      units: job.units,
      unitsNote: "counted from YouCam's published price per task",
    });
  } catch (e2) {
    err.textContent = e2.message;
  } finally {
    await refreshBudget();
    updateGo();
  }
}

async function follow(id) {
  for (;;) {
    await new Promise((r) => setTimeout(r, 2000));
    const res = await fetch(`api/render/${id}`);
    const job = await res.json();
    if (!res.ok) throw new Error(job.error || "Lost track of the render.");
    drawProgress(job.steps);
    if (job.state !== "running") return job;
  }
}

function drawProgress(steps) {
  const words = { waiting: "waiting", running: "rendering", done: "done", failed: "did not apply" };
  $("#progress").replaceChildren(
    ...steps.map((s) =>
      el(
        "li",
        { class: s.status },
        el("span", { class: "dot", "aria-hidden": "true" }),
        el("span", {}, LAYER_LABELS[s.kind], s.error ? el("small", { text: ` · ${s.error.message}` }) : null),
        el("span", { text: words[s.status] + (s.ms ? ` · ${(s.ms / 1000).toFixed(0)} s` : "") }),
      ),
    ),
  );
}

async function refreshBudget() {
  try {
    state.config = { ...state.config, ...(await (await fetch("api/config")).json()) };
    renderBudget();
  } catch {
    /* the budget line is a convenience */
  }
}

/* ---------- examples ---------- */

async function openExample(id) {
  const ch = CHARACTERS.find((c) => c.id === id);
  const m = await (await fetch(`examples/${id}/manifest.json`)).json();
  await buildTag({
    character: ch,
    variant: m.variant,
    who: `Example: fitted on ${FACE_NAMES[m.face]} (an AI-generated person), ${m.renderedAt}`,
    beforeSrc: `demo-faces/${m.face}.jpg`,
    steps: m.steps.map((s) => ({ ...s, src: s.image ? `examples/${id}/${s.image}` : null })),
    units: m.unitsCharged,
    unitsNote: "measured from the YouCam account balance before and after",
  });
}

/* ---------- the tag ---------- */

async function loadImage(src) {
  const img = new Image();
  img.src = src;
  await img.decode();
  return img;
}

function pixels(img, w, h) {
  const c = el("canvas", { width: w, height: h });
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h).data;
}

function changeCanvas(img, mask, w, h) {
  const c = el("canvas", { width: w, height: h });
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);
  if (mask) {
    const o = el("canvas", { width: w, height: h });
    o.getContext("2d").putImageData(new ImageData(overlayFromMask(mask), w, h), 0, 0);
    ctx.drawImage(o, 0, 0);
  }
  return c;
}

const pct = (x) => `${(x * 100).toFixed(x < 0.01 ? 2 : 1)}%`;

async function buildTag(data) {
  const { character: ch } = data;
  const tag = $("#tag-template").content.firstElementChild.cloneNode(true);
  const f = (name) => tag.querySelector(`[data-f="${name}"]`);
  f("setting").textContent = ch.setting;
  f("name").textContent = ch.name;
  f("who").textContent = `${data.who} · hairstyle set: ${ch.variants[data.variant].label}`;

  const before = await loadImage(data.beforeSrc);
  const W = MEASURE_WIDTH;
  const H = Math.round((W * before.naturalHeight) / before.naturalWidth);
  let prevImg = before;
  let prevPx = pixels(before, W, H);
  const rows = [];
  const strip = f("strip");
  let shade = null;

  for (const s of data.steps) {
    if (s.kind === "hat") {
      rows.push({ kind: "hat", status: s.status, error: s.error });
      continue;
    }
    const caption = el("figcaption", {}, el("b", { text: LAYER_LABELS[s.kind] }));
    if (s.status !== "done" || !s.src) {
      rows.push({ kind: s.kind, status: s.status, error: s.error });
      caption.append(el("span", { class: "no", text: `did not apply: ${s.error?.message || "no result"}` }));
      strip.append(el("figure", { class: "layer-card" }, changeCanvas(prevImg, null, W, H), caption));
      continue;
    }
    const img = await loadImage(s.src);
    const px = pixels(img, W, H);
    const st = changeStats(prevPx, px, W, H);
    rows.push({ kind: s.kind, status: s.status, area: st.area });
    if (s.kind === "hairColor") shade = shadeCheck(prevPx, px, st.mask, ch.hairColor.hex);
    const landed = st.area >= MIN_AREA;
    caption.append(
      `${pct(st.area)} of the picture changed`,
      el("br"),
      landed ? "showed up" : el("span", { class: "no", text: "almost nothing changed" }),
    );
    strip.append(
      el(
        "figure",
        { class: "layer-card" },
        labelled(changeCanvas(img, st.mask, W, H), `${LAYER_LABELS[s.kind]}: the pixels this layer changed are painted pink`),
        caption,
      ),
    );
    prevImg = img;
    prevPx = px;
  }

  // Mirror: the photo before, and the finished face card after.
  f("before").src = data.beforeSrc;
  f("before").alt = "Before";
  f("after").src = prevImg.src;
  f("after").alt = `After: ${ch.name}'s look rendered by YouCam`;
  const slider = f("slider");
  const setPos = () => f("mirror").style.setProperty("--pos", `${slider.value}%`);
  slider.addEventListener("input", setPos);
  setPos();

  // Punch card and coverage.
  const cov = coverage(rows);
  f("punches").setAttribute("aria-label", `${cov.landed} of ${cov.planned} pieces showed up`);
  f("punches").replaceChildren(
    ...cov.perStep.map((p) =>
      el("span", { class: `punch${p.landed ? " landed" : ""}`, title: p.why }, el("span", { class: "hole" }), LAYER_LABELS[p.kind]),
    ),
  );
  f("coverage").replaceChildren(
    `${cov.landed} of ${cov.planned} pieces showed up`,
    el("small", {
      text:
        cov.landed === cov.planned
          ? "Every layer of this look rendered with a visible change on this face."
          : `Not shown: ${cov.perStep.filter((p) => !p.landed).map((p) => `${LAYER_LABELS[p.kind].toLowerCase()} (${p.why})`).join("; ")}.`,
    }),
  );

  // Hair shade.
  if (shade) {
    const moved = shade.before - shade.after;
    f("shade").replaceChildren(
      el("h4", { text: "Hair shade" }),
      el(
        "div",
        { class: "swatches" },
        swatch(shade.target, `Called for: ${ch.hairColor.name}`, shade.target),
        swatch(shade.beforeHex, "Before", `ΔE00 ${shade.before.toFixed(1)}`),
        swatch(shade.afterHex, "After", `ΔE00 ${shade.after.toFixed(1)}`),
      ),
      el("p", {
        text:
          moved >= 0
            ? `The colour layer moved this hair ${moved.toFixed(1)} closer to the shade (median of the ${pct(rows.find((r) => r.kind === "hairColor").area)} of pixels it changed).`
            : `The colour layer moved this hair ${(-moved).toFixed(1)} further from the shade: the guest's own hair was already closer. Consider skipping the colour.`,
      }),
    );
  }

  // Shopping list.
  const byKind = Object.fromEntries(cov.perStep.map((p) => [p.kind, p]));
  f("shopping").replaceChildren(
    ...ch.shopping.map((item) => {
      let badge;
      if (!item.layer) badge = el("span", { class: "badge na", text: "not in the preview" });
      else if (!byKind[item.layer]) badge = el("span", { class: "badge na", text: "layer switched off" });
      else if (byKind[item.layer].landed) badge = el("span", { class: "badge yes", text: "previewed" });
      else badge = el("span", { class: "badge no", text: "not previewed" });
      return el(
        "li",
        {},
        el("span", { text: item.item }),
        badge,
        el("span", { class: "links" }, shoppingLinks(item.q).map((l) => el("a", { href: l.href, target: "_blank", rel: "noopener noreferrer" }, l.label))),
      );
    }),
  );

  // Hat portrait.
  const hat = data.steps.find((s) => s.kind === "hat");
  if (hat?.status === "done" && hat.src) {
    f("portrait").hidden = false;
    f("portrait-img").src = hat.src;
    f("portrait-img").alt = `${ch.name}'s hat, rendered by YouCam in a generated scene`;
  }

  f("foot").textContent = `AI-rendered preview, not a photo · ${data.units} YouCam units, ${data.unitsNote} · measured in this browser at ${W}×${H} px, change threshold ${THRESHOLD}/255`;
  f("print").addEventListener("click", () => window.print());

  $("#tag-slot").replaceChildren(tag);
  $("#result").hidden = false;
  $("#result").scrollIntoView({ block: "start" });
}

function swatch(hex, label, value) {
  const chip = el("i");
  chip.style.background = hex; // CSSOM, not a style attribute: the CSP forbids inline styles
  return el("div", { class: "swatch" }, chip, el("b", { text: label }), `${hex} · ${value}`);
}

function labelled(node, text) {
  node.setAttribute("role", "img");
  node.setAttribute("aria-label", text);
  return node;
}

init();
