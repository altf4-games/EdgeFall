"""Train a small 1D-CNN fall classifier on SisFall windows and export TFLite.

Run prepare_dataset.py first to produce data/windows.npz.

Normalization uses fixed, physically-motivated scale constants (not dataset
mean/std) because SisFall's belt-mounted sensors and a phone in a pocket see
different distributions -- fixed scaling generalizes better than statistics
fit to this dataset alone. NORM_SCALE below MUST be mirrored exactly in the
Flutter app's ml_fall_detector.dart, since the on-device model expects
input features on the same scale it was trained on.
"""

import pathlib

import numpy as np
import tensorflow as tf
from tensorflow import keras

DATA_PATH = pathlib.Path(__file__).parent / "data" / "windows.npz"
OUTPUT_DIR = pathlib.Path(__file__).parent / "output"
ASSET_DIR = pathlib.Path(__file__).parent.parent / "assets" / "model"

WINDOW_SIZE = 100  # 2s @ 50Hz, must match prepare_dataset.py
NUM_CHANNELS = 3  # accel_mag, gyro_mag, jerk

# accel_mag [m/s^2], gyro_mag [rad/s], jerk [m/s^3] -> roughly [-1, 3] range
NORM_SCALE = np.array([30.0, 10.0, 500.0], dtype=np.float32)

SEED = 42


def subject_wise_split(subjects: np.ndarray, val_frac=0.15, test_frac=0.15):
    rng = np.random.default_rng(SEED)
    unique_subjects = subjects.copy()
    unique_subjects = np.unique(unique_subjects)
    rng.shuffle(unique_subjects)

    n = len(unique_subjects)
    n_test = max(1, int(n * test_frac))
    n_val = max(1, int(n * val_frac))

    test_subjects = set(unique_subjects[:n_test])
    val_subjects = set(unique_subjects[n_test:n_test + n_val])
    train_subjects = set(unique_subjects[n_test + n_val:])

    train_mask = np.array([s in train_subjects for s in subjects])
    val_mask = np.array([s in val_subjects for s in subjects])
    test_mask = np.array([s in test_subjects for s in subjects])
    return train_mask, val_mask, test_mask


def build_model() -> keras.Model:
    inputs = keras.Input(shape=(WINDOW_SIZE, NUM_CHANNELS))
    x = keras.layers.Conv1D(16, 5, padding="same", activation="relu")(inputs)
    x = keras.layers.MaxPooling1D(2)(x)
    x = keras.layers.Conv1D(32, 5, padding="same", activation="relu")(x)
    x = keras.layers.GlobalAveragePooling1D()(x)
    x = keras.layers.Dense(16, activation="relu")(x)
    x = keras.layers.Dropout(0.3)(x)
    outputs = keras.layers.Dense(1, activation="sigmoid")(x)
    model = keras.Model(inputs, outputs)
    model.compile(
        optimizer=keras.optimizers.Adam(1e-3),
        loss="binary_crossentropy",
        metrics=["accuracy", keras.metrics.Precision(name="precision"),
                 keras.metrics.Recall(name="recall")],
    )
    return model


def main() -> None:
    data = np.load(DATA_PATH)
    x, y, subjects = data["x"], data["y"], data["subjects"]

    x_norm = x / NORM_SCALE

    train_mask, val_mask, test_mask = subject_wise_split(subjects)
    x_train, y_train = x_norm[train_mask], y[train_mask]
    x_val, y_val = x_norm[val_mask], y[val_mask]
    x_test, y_test = x_norm[test_mask], y[test_mask]

    print(f"train={len(y_train)} (falls={y_train.sum()}) "
          f"val={len(y_val)} (falls={y_val.sum()}) "
          f"test={len(y_test)} (falls={y_test.sum()})")

    n_pos = y_train.sum()
    n_neg = len(y_train) - n_pos
    class_weight = {0: 1.0, 1: n_neg / max(n_pos, 1)}
    print(f"class_weight={class_weight}")

    model = build_model()
    model.summary()

    callbacks = [
        keras.callbacks.EarlyStopping(
            monitor="val_recall", mode="max", patience=8,
            restore_best_weights=True),
    ]

    model.fit(
        x_train, y_train,
        validation_data=(x_val, y_val),
        epochs=50,
        batch_size=64,
        class_weight=class_weight,
        callbacks=callbacks,
        verbose=2,
    )

    print("\nTest set evaluation:")
    results = model.evaluate(x_test, y_test, verbose=0, return_dict=True)
    for k, v in results.items():
        print(f"  {k}: {v:.4f}")

    y_pred = (model.predict(x_test, verbose=0) > 0.5).astype(int).flatten()
    tp = int(((y_pred == 1) & (y_test == 1)).sum())
    fp = int(((y_pred == 1) & (y_test == 0)).sum())
    fn = int(((y_pred == 0) & (y_test == 1)).sum())
    tn = int(((y_pred == 0) & (y_test == 0)).sum())
    print(f"  confusion matrix: tp={tp} fp={fp} fn={fn} tn={tn}")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    ASSET_DIR.mkdir(parents=True, exist_ok=True)

    keras_path = OUTPUT_DIR / "fall_model.keras"
    model.save(keras_path)
    print(f"Saved Keras model to {keras_path}")

    converter = tf.lite.TFLiteConverter.from_keras_model(model)
    converter.optimizations = [tf.lite.Optimize.DEFAULT]
    tflite_model = converter.convert()

    tflite_path = ASSET_DIR / "fall_model.tflite"
    tflite_path.write_bytes(tflite_model)
    print(f"Saved TFLite model to {tflite_path} ({len(tflite_model)} bytes)")


if __name__ == "__main__":
    main()
