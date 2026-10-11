"""Draw the preprocessing pipeline + 1D-CNN architecture to results/architecture.png.

Layer shapes and parameter counts mirror build_model() in train.py.
"""

import pathlib

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch

OUT = pathlib.Path(__file__).parent / "results" / "architecture.png"

PIPELINE = [
    ("Raw SisFall\n200 Hz, ADC counts", "#eceff1"),
    ("Physical units\nm/s², rad/s", "#eceff1"),
    ("Magnitude\n‖(x,y,z)‖", "#eceff1"),
    ("Downsample\n200 → 50 Hz", "#eceff1"),
    ("+ Jerk, 2 s window\n100 × 3", "#eceff1"),
    ("Normalize\n÷ [30, 10, 500]", "#eceff1"),
]

# (title, output shape, params, colour)
LAYERS = [
    ("Input", "100 × 3", "", "#cfd8dc"),
    ("Conv1D\n16 filters, k=5\nReLU", "100 × 16", "256 params", "#90caf9"),
    ("MaxPool1D\npool=2", "50 × 16", "", "#bbdefb"),
    ("Conv1D\n32 filters, k=5\nReLU", "50 × 32", "2,592 params", "#90caf9"),
    ("GlobalAvgPool\nover time", "32", "", "#bbdefb"),
    ("Dense 16\nReLU", "16", "528 params", "#a5d6a7"),
    ("Dropout\n0.3", "16", "", "#e0e0e0"),
    ("Dense 1\nSigmoid", "1", "17 params", "#ffcc80"),
]


def box(ax, x, y, w, h, text, color, fs=9):
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.02,rounding_size=0.08",
                                fc=color, ec="#455a64", lw=1.2))
    ax.text(x + w / 2, y + h / 2, text, ha="center", va="center", fontsize=fs)


def arrow(ax, x0, x1, y):
    ax.annotate("", xy=(x1, y), xytext=(x0, y),
                arrowprops=dict(arrowstyle="->", color="#455a64", lw=1.3))


def main() -> None:
    OUT.parent.mkdir(exist_ok=True)
    fig, ax = plt.subplots(figsize=(15, 6.2))
    ax.set_xlim(0, 15)
    ax.set_ylim(0, 6.2)
    ax.axis("off")

    # Row 1: preprocessing pipeline
    ax.text(0.1, 5.85, "Preprocessing (prepare_dataset.py + NORM_SCALE)", fontsize=11,
            fontweight="bold")
    w, gap = 2.1, 0.35
    for i, (t, c) in enumerate(PIPELINE):
        x = 0.1 + i * (w + gap)
        box(ax, x, 4.55, w, 0.95, t, c)
        if i < len(PIPELINE) - 1:
            arrow(ax, x + w, x + w + gap, 5.02)

    # Row 2: network
    ax.text(0.1, 3.85, "1D-CNN (train.py) — 3,393 parameters, ~12 KB as TFLite",
            fontsize=11, fontweight="bold")
    w, gap = 1.45, 0.25
    for i, (t, shape, params, c) in enumerate(LAYERS):
        x = 0.1 + i * (w + gap)
        box(ax, x, 1.85, w, 1.55, t, c)
        ax.text(x + w / 2, 1.6, shape, ha="center", fontsize=9, fontweight="bold")
        if params:
            ax.text(x + w / 2, 1.3, params, ha="center", fontsize=8, color="#546e7a")
        if i < len(LAYERS) - 1:
            arrow(ax, x + w, x + w + gap, 2.62)

    ax.text(0.1, 0.75,
            "Conv filters slide along the time axis; the 3 sensor channels act like RGB.   "
            "Output = fall probability.",
            fontsize=9, color="#37474f")
    ax.text(0.1, 0.3,
            "On device: alert if probability ≥ 0.95 on 2 consecutive windows, then 10 s cooldown.",
            fontsize=9, color="#37474f")

    fig.savefig(OUT, dpi=150, bbox_inches="tight", facecolor="white")
    print(f"Saved {OUT}")


if __name__ == "__main__":
    main()
