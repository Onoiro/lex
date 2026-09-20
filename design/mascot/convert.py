#!/usr/bin/env python3
"""Convert mascot PNGs to WebP (quality 80). Run from repo root."""
import os

from PIL import Image

SRC = os.path.join("client", "public", "mascot")

for name in sorted(os.listdir(SRC)):
    if not name.endswith(".png"):
        continue
    path = os.path.join(SRC, name)
    img = Image.open(path).convert("RGBA")
    out = os.path.join(SRC, name[: -len(".png")] + ".webp")
    img.save(out, "WEBP", quality=80, method=6)
    print(out, os.path.getsize(out))
