# Copies the raw example renders from _dev/samples/<id>/ into public/examples/<id>/
# as JPEG (quality 90): YouCam returns hair colour, makeup and earrings as PNG,
# about 1 MB each, which is heavy for a demo page. Nothing is deleted.
#
#   python scripts/publish-examples.py
import glob
import json
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
for src_dir in sorted(glob.glob(os.path.join(ROOT, "_dev", "samples", "*"))):
    cid = os.path.basename(src_dir)
    with open(os.path.join(src_dir, "manifest.json"), encoding="utf-8") as f:
        manifest = json.load(f)
    out_dir = os.path.join(ROOT, "public", "examples", cid)
    os.makedirs(out_dir, exist_ok=True)
    for step in manifest["steps"]:
        if not step.get("image"):
            continue
        name = os.path.splitext(step["image"])[0] + ".jpg"
        Image.open(os.path.join(src_dir, step["image"])).convert("RGB").save(os.path.join(out_dir, name), quality=90)
        step["image"] = name
    manifest["note"] = "Step images re-saved as JPEG (quality 90) from what YouCam returned."
    with open(os.path.join(out_dir, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    print(cid, len([s for s in manifest["steps"] if s.get("image")]), "images")
