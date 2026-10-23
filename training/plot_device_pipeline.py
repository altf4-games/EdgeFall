"""Draw the on-phone inference flow to results/device_pipeline.png.

Mirrors lib/services/background_service.dart and ml_fall_detector.dart.
"""

import pathlib

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch

OUT = pathlib.Path(__file__).parent / "results" / "device_pipeline.png"

ROW1 = [
    ("Accelerometer +\ngyroscope\n(sensors_plus)", "#cfd8dc"),
    ("50 Hz timer\nlatest reading\nof each sensor", "#eceff1"),
    ("Magnitude and\njerk, divide by\n[30, 10, 500]", "#eceff1"),
    ("Ring buffer\n100 × 3\n(last 2 s)", "#bbdefb"),
]
ROW2 = [
    ("TFLite model\n(flutter_litert)\nevery 5 samples", "#90caf9"),
    ("Probability\n> 0.95 on two\nwindows in a row?", "#ffe0b2"),
    ("10 s cooldown", "#e0e0e0"),
    ("Local\nnotification", "#a5d6a7"),
]


def box(ax, x, y, w, h, text, color):
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.02,rounding_size=0.08",
                                fc=color, ec="#455a64", lw=1.2))
    ax.text(x + w / 2, y + h / 2, text, ha="center", va="center", fontsize=9.5)


def arrow(ax, p0, p1):
    ax.annotate("", xy=p1, xytext=p0,
                arrowprops=dict(arrowstyle="->", color="#455a64", lw=1.4))


def main() -> None:
    OUT.parent.mkdir(exist_ok=True)
    fig, ax = plt.subplots(figsize=(11, 4.2))
    ax.set_xlim(0, 11)
    ax.set_ylim(0, 4.2)
    ax.axis("off")
    w, h, gap = 2.2, 1.1, 0.6
    x0 = 0.2
    ys = (2.7, 0.7)
    for row, y in zip((ROW1, ROW2), ys):
        for i, (t, c) in enumerate(row):
            x = x0 + i * (w + gap)
            box(ax, x, y, w, h, t, c)
            if i < len(row) - 1:
                arrow(ax, (x + w, y + h / 2), (x + w + gap, y + h / 2))
    last1 = x0 + 3 * (w + gap) + w / 2
    arrow(ax, (last1, ys[0]), (x0 + w / 2, ys[1] + h))
    ax.text(5.5, 2.05, "when the buffer is full", ha="center", fontsize=8.5, color="#546e7a")
    ax.text(0.3, 0.2, "Runs in an Android foreground service, so monitoring continues "
            "when the app is closed.", fontsize=9, color="#37474f")
    fig.savefig(OUT, dpi=150, bbox_inches="tight", facecolor="white")
    print(f"Saved {OUT}")


if __name__ == "__main__":
    main()
