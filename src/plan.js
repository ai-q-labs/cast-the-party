// Turns a character look into YouCam task requests, one per layer.
// Request shapes follow the published OpenAPI files at docs.perfectcorp.com
// (reference/ai_hairstyle, ai_hair_color, makeup_vto, ai_earrings, ai_hat).

import { CHARACTERS, LAYER_ORDER, UNITS, layersFor } from "../public/characters.js";

export const TASK_PATHS = {
  hairstyle: "/s2s/v2.0/task/hair-style",
  hairColor: "/s2s/v2.0/task/hair-color",
  makeup: "/s2s/v2.0/task/makeup-vto",
  earrings: "/s2s/v2.0/task/2d-vto/earring",
  hat: "/s2s/v2.0/task/hat",
};

export function findCharacter(id) {
  return CHARACTERS.find((c) => c.id === id) || null;
}

// The layers a request will run: the character's own layers, minus any the
// guest switched off. The hairstyle carries the look, so it always runs.
export function chooseLayers(character, skip = []) {
  const off = new Set(Array.isArray(skip) ? skip : []);
  return layersFor(character).filter((k) => k === "hairstyle" || !off.has(k));
}

const srcFields = (src) => (src.url ? { src_file_url: src.url } : { src_file_id: src.fileId });
const srcName = (src) => src.url || src.fileId;

// src: { url } (a previous result) or { fileId } (the uploaded photo)
// propIds: { "<prop key>": file_id } for the hat and earring product photos
export function buildRequest(kind, character, variant, src, propIds = {}) {
  const v = character.variants[variant];
  if (!v) throw new Error(`unknown variant ${variant}`);
  switch (kind) {
    case "hairstyle":
      return { ...srcFields(src), template_id: v.hairstyle };
    case "hairColor":
      return {
        ...srcFields(src),
        pattern: { name: "full" },
        palettes: [{ color: character.hairColor.hex, color_intensity: character.hairColor.intensity, shine_intensity: 40 }],
      };
    case "makeup":
      return {
        ...srcFields(src),
        version: "1.0",
        // Skin smoothing off: the look is lips, liner, brows and blush, and a
        // whole-face filter would blur the "what changed" measurement.
        effects: [{ category: "skin_smooth", skinSmoothStrength: 0, skinSmoothColorIntensity: 0 }, ...character.makeup],
      };
    case "earrings": {
      const ref = propIds[character.earrings];
      if (!ref) throw new Error(`no uploaded file for ${character.earrings}`);
      return {
        ...srcFields(src),
        ref_file_ids: [ref],
        source_info: { name: srcName(src) },
        object_infos: [{ name: ref, parameter: { earring_need_remove_background: true } }],
      };
    }
    case "hat": {
      const ref = propIds[character.hat.prop];
      if (!ref) throw new Error(`no uploaded file for ${character.hat.prop}`);
      return { ...srcFields(src), ref_file_id: ref, gender: variant, style: character.hat.style };
    }
    default:
      throw new Error(`unknown layer ${kind}`);
  }
}

export function plannedUnits(layers) {
  return layers.reduce((s, k) => s + UNITS[k], 0);
}

export { LAYER_ORDER, UNITS };
