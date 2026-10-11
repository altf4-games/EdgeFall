"""Evaluate the bundled TFLite model on the held-out SisFall test subjects.

Uses the same deterministic subject-wise split as train.py, so the test
subjects were never seen during training. Evaluating the shipped .tflite
(rather than the Keras model) measures exactly what runs on the phone,
including the dynamic-range quantization.

Run prepare_dataset.py first. Writes metrics + plots to training/results/.
"""

import json
import pathlib

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import tensorflow as tf
from sklearn.metrics import (average_precision_score, precision_recall_curve,
                             roc_auc_score, roc_curve)

from train import ASSET_DIR, DATA_PATH, NORM_SCALE, subject_wise_split

RESULTS_DIR = pathlib.Path(__file__).parent / "results"
THRESHOLDS = [0.5, 0.9, 0.95]  # 0.95 is the app's positiveThreshold


def predict_tflite(x: np.ndarray) -> np.ndarray:
    interpreter = tf.lite.Interpreter(model_path=str(ASSET_DIR / "fall_model.tflite"))
    interpreter.allocate_tensors()
    inp = interpreter.get_input_details()[0]
    out = interpreter.get_output_details()[0]
    preds = np.empty(len(x), dtype=np.float32)
    for i in range(len(x)):
        interpreter.set_tensor(inp["index"], x[i:i + 1])
        interpreter.invoke()
        preds[i] = interpreter.get_tensor(out["index"])[0, 0]
    return preds


def confusion(y, p, thr):
    pred = p >= thr
    tp = int((pred & (y == 1)).sum())
    fp = int((pred & (y == 0)).sum())
    fn = int((~pred & (y == 1)).sum())
    tn = int((~pred & (y == 0)).sum())
    return tp, fp, fn, tn


def plot_confusion(ax, tp, fp, fn, tn, thr):
    cm = np.array([[tn, fp], [fn, tp]])
    ax.imshow(cm, cmap="Blues")
    for (r, c), v in np.ndenumerate(cm):
        ax.text(c, r, str(v), ha="center", va="center", fontsize=13,
                color="white" if v > cm.max() / 2 else "black")
    ax.set_xticks([0, 1], ["ADL", "Fall"])
    ax.set_yticks([0, 1], ["ADL", "Fall"])
    ax.set_xlabel("Predicted")
    ax.set_ylabel("Actual")
    ax.set_title(f"threshold = {thr}")


def main() -> None:
    RESULTS_DIR.mkdir(exist_ok=True)
    data = np.load(DATA_PATH)
    x, y, subjects = data["x"] / NORM_SCALE, data["y"], data["subjects"]
    _, _, test_mask = subject_wise_split(subjects)
    x_test, y_test = x[test_mask].astype(np.float32), y[test_mask]
    test_subjects = sorted(set(subjects[test_mask]))
    print(f"test windows={len(y_test)} falls={int(y_test.sum())} "
          f"subjects={test_subjects}")

    p = predict_tflite(x_test)

    metrics = {
        "test_subjects": test_subjects,
        "n_windows": int(len(y_test)),
        "n_falls": int(y_test.sum()),
        "n_adl": int((y_test == 0).sum()),
        "roc_auc": float(roc_auc_score(y_test, p)),
        "average_precision": float(average_precision_score(y_test, p)),
        "thresholds": {},
    }
    for thr in THRESHOLDS:
        tp, fp, fn, tn = confusion(y_test, p, thr)
        metrics["thresholds"][str(thr)] = {
            "tp": tp, "fp": fp, "fn": fn, "tn": tn,
            "precision": tp / max(tp + fp, 1),
            "recall": tp / max(tp + fn, 1),
            "specificity": tn / max(tn + fp, 1),
            "accuracy": (tp + tn) / len(y_test),
            "f1": 2 * tp / max(2 * tp + fp + fn, 1),
        }
    (RESULTS_DIR / "metrics.json").write_text(json.dumps(metrics, indent=2))
    print(json.dumps(metrics, indent=2))

    # Confusion matrices at each threshold
    fig, axes = plt.subplots(1, len(THRESHOLDS), figsize=(4.2 * len(THRESHOLDS), 4))
    for ax, thr in zip(axes, THRESHOLDS):
        plot_confusion(ax, *confusion(y_test, p, thr), thr)
    fig.suptitle("Confusion matrices (held-out test subjects, TFLite model)")
    fig.tight_layout()
    fig.savefig(RESULTS_DIR / "confusion_matrices.png", dpi=150)
    plt.close(fig)

    # ROC + PR curves with the operating points marked
    fpr, tpr, _ = roc_curve(y_test, p)
    prec, rec, _ = precision_recall_curve(y_test, p)
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(10, 4.2))
    a1.plot(fpr, tpr, label=f"AUC = {metrics['roc_auc']:.3f}")
    a1.plot([0, 1], [0, 1], "k--", lw=0.8)
    a2.plot(rec, prec, label=f"AP = {metrics['average_precision']:.3f}")
    for thr in THRESHOLDS:
        m = metrics["thresholds"][str(thr)]
        a1.scatter(1 - m["specificity"], m["recall"], zorder=3, label=f"thr {thr}")
        a2.scatter(m["recall"], m["precision"], zorder=3, label=f"thr {thr}")
    a1.set(xlabel="False positive rate", ylabel="True positive rate (recall)",
           title="ROC curve")
    a2.set(xlabel="Recall", ylabel="Precision", title="Precision-recall curve")
    a1.legend()
    a2.legend()
    fig.tight_layout()
    fig.savefig(RESULTS_DIR / "roc_pr_curves.png", dpi=150)
    plt.close(fig)

    # Score distributions per class
    fig, ax = plt.subplots(figsize=(6, 4))
    bins = np.linspace(0, 1, 41)
    ax.hist(p[y_test == 0], bins=bins, alpha=0.6, label="ADL", log=True)
    ax.hist(p[y_test == 1], bins=bins, alpha=0.6, label="Fall", log=True)
    ax.axvline(0.95, color="k", ls="--", label="app threshold (0.95)")
    ax.set(xlabel="Model output (fall probability)", ylabel="Windows (log)",
           title="Score distribution on test set")
    ax.legend()
    fig.tight_layout()
    fig.savefig(RESULTS_DIR / "score_distribution.png", dpi=150)
    plt.close(fig)


if __name__ == "__main__":
    main()
