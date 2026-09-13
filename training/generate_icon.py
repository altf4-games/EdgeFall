"""Generate the EdgeFall app icon: a pulse/impact glyph on an orange gradient.

Produces three files under ../assets/icon/, consumed by flutter_launcher_icons
(see pubspec.yaml):
  - icon_background.png: opaque gradient, used as the adaptive icon background
  - icon_foreground.png: white glyph on transparent, adaptive icon foreground
  - icon.png: flattened combination, used for the legacy square icon
"""

import math
import pathlib

from PIL import Image, ImageDraw

SIZE = 1024
OUT_DIR = pathlib.Path(__file__).parent.parent / "assets" / "icon"

# Deep orange -> red-orange, matching the app's Material colorSchemeSeed.
GRADIENT_TOP = (255, 138, 61)
GRADIENT_BOTTOM = (216, 67, 21)


def make_background() -> Image.Image:
    img = Image.new("RGB", (SIZE, SIZE))
    pixels = img.load()
    for y in range(SIZE):
        t = y / (SIZE - 1)
        r = round(GRADIENT_TOP[0] + (GRADIENT_BOTTOM[0] - GRADIENT_TOP[0]) * t)
        g = round(GRADIENT_TOP[1] + (GRADIENT_BOTTOM[1] - GRADIENT_TOP[1]) * t)
        b = round(GRADIENT_TOP[2] + (GRADIENT_BOTTOM[2] - GRADIENT_TOP[2]) * t)
        for x in range(SIZE):
            pixels[x, y] = (r, g, b)
    return img


def make_foreground() -> Image.Image:
    """A heartbeat/pulse line with one sharp spike (the impact), on
    transparent background, sized within Android's adaptive-icon safe zone
    (~66% of the canvas)."""
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    cx, cy = SIZE // 2, SIZE // 2
    half_w = int(SIZE * 0.30)
    stroke = int(SIZE * 0.045)

    # Pulse path, in fractions of half_w/amplitude, left to right.
    amp = int(SIZE * 0.16)
    points_frac = [
        (-1.00, 0.00),
        (-0.55, 0.00),
        (-0.42, 0.00),
        (-0.30, -0.55),   # small rise
        (-0.18, 0.00),
        (-0.06, 1.00),    # sharp spike up (the impact)
        (0.02, -1.15),    # sharp spike down
        (0.14, 0.00),
        (0.30, 0.00),
        (1.00, 0.00),
    ]
    points = [(cx + fx * half_w, cy + fy * amp) for fx, fy in points_frac]

    draw.line(points, fill=(255, 255, 255, 255), width=stroke, joint="curve")

    # Round the line caps/joints.
    r = stroke // 2
    for px, py in points:
        draw.ellipse([px - r, py - r, px + r, py + r], fill=(255, 255, 255, 255))

    # A small dot at the leading edge, like a cursor/sensor point.
    dot_r = int(SIZE * 0.028)
    dot_x, dot_y = points[-1]
    draw.ellipse(
        [dot_x - dot_r, dot_y - dot_r, dot_x + dot_r, dot_y + dot_r],
        fill=(255, 255, 255, 255),
    )

    return img


def flatten(background: Image.Image, foreground: Image.Image) -> Image.Image:
    combined = background.convert("RGBA")
    combined.alpha_composite(foreground)
    return combined.convert("RGB")


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    background = make_background()
    foreground = make_foreground()
    flattened = flatten(background, foreground)

    background.save(OUT_DIR / "icon_background.png")
    foreground.save(OUT_DIR / "icon_foreground.png")
    flattened.save(OUT_DIR / "icon.png")
    print(f"Wrote icon assets to {OUT_DIR}")


if __name__ == "__main__":
    main()
