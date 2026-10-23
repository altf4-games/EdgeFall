"""Compare the float baseline with compressed variants of the fall classifier.

Variants (all evaluated on the same held-out test subjects as evaluate.py):
  keras_fp32         Keras model, float32 (baseline)
  tflite_fp32        TFLite conversion without quantization
  tflite_dynamic     TFLite with dynamic-range quantization (what the app ships)
  pruned_fp32        L1-norm structured pruning (half the filters in each conv
                     layer removed) + fine-tuning, float32 TFLite
  pruned_dynamic     the pruned model with dynamic-range quantization

Uses output/fall_model.keras from train.py. Writes results/compression.json
and results/compression.png. Latency is measured on the CPU of the machine
this runs on (single thread, batch of one), not on a phone.
"""

import json
import pathlib
import time

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import tensorflow as tf
from sklearn.metrics import roc_auc_score
from tensorflow import keras

from train import DATA_PATH, NORM_SCALE, OUTPUT_DIR, SEED, build_model, subject_wise_split

RESULTS_DIR = pathlib.Path(__file__).parent / "results"
THRESHOLD = 0.9
LATENCY_RUNS = 2000
PRUNE_KEEP = {"conv1": 8, "conv2": 16}


def metrics(y, p):
    pred = p >= THRESHOLD
    tp = int((pred & (y == 1)).sum())
    fp = int((pred & (y == 0)).sum())
    fn = int((~pred & (y == 1)).sum())
    prec = tp / max(tp + fp, 1)
    rec = tp / max(tp + fn, 1)
    return {"precision": prec, "recall": rec,
            "f1": 2 * prec * rec / max(prec + rec, 1e-9),
            "roc_auc": float(roc_auc_score(y, p))}


def convert(model, quantize):
    conv = tf.lite.TFLiteConverter.from_keras_model(model)
    if quantize:
        conv.optimizations = [tf.lite.Optimize.DEFAULT]
    return conv.convert()


def run_tflite(blob, x, time_it=True):
    it = tf.lite.Interpreter(model_content=blob, num_threads=1)
    it.allocate_tensors()
    inp, out = it.get_input_details()[0], it.get_output_details()[0]
    preds = np.empty(len(x), dtype=np.float32)
    for i in range(len(x)):
        it.set_tensor(inp["index"], x[i:i + 1])
        it.invoke()
        preds[i] = it.get_tensor(out["index"])[0, 0]
    lat = None
    if time_it:
        sample = x[:1]
        for _ in range(50):  # warm-up
            it.set_tensor(inp["index"], sample)
            it.invoke()
        times = []
        for _ in range(LATENCY_RUNS):
            t = time.perf_counter()
            it.set_tensor(inp["index"], sample)
            it.invoke()
            times.append((time.perf_counter() - t) * 1000)
        lat = float(np.median(times))
    return preds, lat


def keras_latency(model, x):
    sample = x[:1]
    fn = tf.function(lambda t: model(t, training=False))
    for _ in range(50):
        fn(sample)
    times = []
    for _ in range(LATENCY_RUNS):
        t = time.perf_counter()
        fn(sample).numpy()
        times.append((time.perf_counter() - t) * 1000)
    return float(np.median(times))


def prune_model(model):
    """Remove the filters with the smallest L1 norm from both conv layers."""
    c1, c2 = model.layers[1], model.layers[3]
    k1, b1 = c1.get_weights()
    k2, b2 = c2.get_weights()
    keep1 = np.sort(np.argsort(-np.abs(k1).sum(axis=(0, 1)))[:PRUNE_KEEP["conv1"]])
    k1, b1 = k1[:, :, keep1], b1[keep1]
    k2 = k2[:, keep1, :]  # inputs follow the surviving conv1 filters
    keep2 = np.sort(np.argsort(-np.abs(k2).sum(axis=(0, 1)))[:PRUNE_KEEP["conv2"]])
    k2, b2 = k2[:, :, keep2], b2[keep2]
    d1k, d1b = model.layers[5].get_weights()
    d1k = d1k[keep2, :]
    d2 = model.layers[7].get_weights()

    inputs = keras.Input(shape=model.input_shape[1:])
    x = keras.layers.Conv1D(len(keep1), 5, padding="same", activation="relu")(inputs)
    x = keras.layers.MaxPooling1D(2)(x)
    x = keras.layers.Conv1D(len(keep2), 5, padding="same", activation="relu")(x)
    x = keras.layers.GlobalAveragePooling1D()(x)
    x = keras.layers.Dense(16, activation="relu")(x)
    x = keras.layers.Dropout(0.3)(x)
    out = keras.layers.Dense(1, activation="sigmoid")(x)
    pruned = keras.Model(inputs, out)
    pruned.layers[1].set_weights([k1, b1])
    pruned.layers[3].set_weights([k2, b2])
    pruned.layers[5].set_weights([d1k, d1b])
    pruned.layers[7].set_weights(d2)
    pruned.compile(optimizer=keras.optimizers.Adam(1e-3), loss="binary_crossentropy",
                   metrics=["accuracy", keras.metrics.Precision(name="precision"),
                            keras.metrics.Recall(name="recall")])
    return pruned


def main() -> None:
    keras.utils.set_random_seed(SEED)
    data = np.load(DATA_PATH)
    x = (data["x"] / NORM_SCALE).astype(np.float32)
    y, subjects = data["y"], data["subjects"]
    tr, va, te = subject_wise_split(subjects)
    x_te, y_te = x[te], y[te]
    n_pos = y[tr].sum()
    class_weight = {0: 1.0, 1: (len(y[tr]) - n_pos) / n_pos}

    baseline = keras.models.load_model(OUTPUT_DIR / "fall_model.keras")
    results = {}

    p = baseline.predict(x_te, verbose=0).ravel()
    keras_path = OUTPUT_DIR / "fall_model.keras"
    results["keras_fp32"] = {"params": int(baseline.count_params()),
                             "size_kb": keras_path.stat().st_size / 1024,
                             "latency_ms": keras_latency(baseline, x_te),
                             **metrics(y_te, p)}

    for name, quant in [("tflite_fp32", False), ("tflite_dynamic", True)]:
        blob = convert(baseline, quant)
        p, lat = run_tflite(blob, x_te)
        results[name] = {"params": int(baseline.count_params()),
                         "size_kb": len(blob) / 1024, "latency_ms": lat,
                         **metrics(y_te, p)}

    pruned = prune_model(baseline)
    p0 = pruned.predict(x_te, verbose=0).ravel()
    before_ft = metrics(y_te, p0)
    pruned.fit(x[tr], y[tr], validation_data=(x[va], y[va]), epochs=30, batch_size=64,
               class_weight=class_weight, verbose=0,
               callbacks=[keras.callbacks.EarlyStopping(
                   monitor="val_recall", mode="max", patience=8,
                   restore_best_weights=True)])
    for name, quant in [("pruned_fp32", False), ("pruned_dynamic", True)]:
        blob = convert(pruned, quant)
        p, lat = run_tflite(blob, x_te)
        results[name] = {"params": int(pruned.count_params()),
                         "size_kb": len(blob) / 1024, "latency_ms": lat,
                         **metrics(y_te, p)}
    results["pruned_before_finetune"] = before_ft
    results["_meta"] = {"threshold": THRESHOLD, "test_windows": int(len(y_te)),
                        "latency_runs": LATENCY_RUNS,
                        "tensorflow": tf.__version__, "prune_keep": PRUNE_KEEP}

    RESULTS_DIR.mkdir(exist_ok=True)
    (RESULTS_DIR / "compression.json").write_text(json.dumps(results, indent=2))
    print(json.dumps(results, indent=2))

    names = ["keras_fp32", "tflite_fp32", "tflite_dynamic", "pruned_fp32", "pruned_dynamic"]
    labels = ["Keras\nfloat32", "TFLite\nfloat32", "TFLite\ndynamic int8", "Pruned\nfloat32",
              "Pruned\ndynamic int8"]
    colors = ["#90a4ae", "#90caf9", "#1e88e5", "#a5d6a7", "#43a047"]
    fig, axes = plt.subplots(1, 3, figsize=(14, 4))
    for ax, key, title in zip(axes, ["size_kb", "latency_ms", "f1"],
                              ["Model size (KB)", "Latency, median per window (ms)",
                               f"F1 at threshold {THRESHOLD}"]):
        vals = [results[n][key] for n in names]
        bars = ax.bar(labels, vals, color=colors)
        ax.bar_label(bars, fmt="%.3g", fontsize=8)
        ax.set_title(title)
        ax.tick_params(axis="x", labelsize=8)
    fig.tight_layout()
    fig.savefig(RESULTS_DIR / "compression.png", dpi=150)


if __name__ == "__main__":
    main()
