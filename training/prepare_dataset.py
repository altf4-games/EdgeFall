"""Parse the SisFall dataset into fixed-length windows for training.

SisFall file format: 9 comma-separated columns per line, one line per sample
at 200 Hz, raw ADC counts (see Readme.txt in the dataset for the full spec):
  1-3: ADXL345 accelerometer (x, y, z), 13-bit, +-16g
  4-6: ITG3200 gyroscope (x, y, z), 16-bit, +-2000 deg/s
  7-9: MMA8451Q accelerometer (x, y, z) - unused here (narrower +-8g range
       clips during high-impact falls, so we use the ADXL345 channel instead)

We only use ADXL345 + ITG3200 magnitudes (not raw per-axis values) because a
phone's orientation in a pocket has no fixed relationship to how SisFall's
device was belt-mounted -- magnitude is orientation-invariant and is exactly
what the app can compute from sensors_plus accelerometer/gyroscope events.

Each ADL (D##) file is a single continuous activity with no fall in it, so we
slide non-overlapping windows across it as negative examples. Each fall (F##)
file is a ~15s recording where the fall itself is a brief event -- literature
convention is to center a window on the peak-acceleration sample, which is
the impact moment.
"""

import pathlib
import re

import numpy as np

DATASET_DIR = pathlib.Path(__file__).parent / "data" / "SisFall" / "dataset" / "SisFall_dataset"
OUTPUT_PATH = pathlib.Path(__file__).parent / "data" / "windows.npz"

SOURCE_HZ = 200
TARGET_HZ = 50
DOWNSAMPLE_FACTOR = SOURCE_HZ // TARGET_HZ

WINDOW_SECONDS = 2.0
WINDOW_SIZE = int(WINDOW_SECONDS * TARGET_HZ)  # 100 samples
ADL_STRIDE = WINDOW_SIZE  # non-overlapping windows for ADLs

ACCEL_RANGE_G = 16
ACCEL_RESOLUTION_BITS = 13
ACCEL_G_PER_COUNT = (2 * ACCEL_RANGE_G) / (2 ** ACCEL_RESOLUTION_BITS)
G_TO_MS2 = 9.80665

GYRO_RANGE_DPS = 2000
GYRO_RESOLUTION_BITS = 16
GYRO_DPS_PER_COUNT = (2 * GYRO_RANGE_DPS) / (2 ** GYRO_RESOLUTION_BITS)
DPS_TO_RAD_S = np.pi / 180

FILENAME_RE = re.compile(r"^([DF]\d{2})_(S[AE]\d{2})_(R\d{2})\.txt$")


def load_file(path: pathlib.Path) -> np.ndarray:
    """Return an (N, 9) array of raw ADC counts for one recording."""
    text = path.read_text().strip()
    rows = []
    for line in text.splitlines():
        line = line.strip().rstrip(";")
        if not line:
            continue
        rows.append([int(v) for v in line.split(",")])
    return np.array(rows, dtype=np.float64)


def to_physical_units(raw: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Convert raw ADXL345 + ITG3200 columns to m/s^2 and rad/s magnitudes."""
    accel_counts = raw[:, 0:3]
    gyro_counts = raw[:, 3:6]

    accel_ms2 = accel_counts * ACCEL_G_PER_COUNT * G_TO_MS2
    gyro_rad_s = gyro_counts * GYRO_DPS_PER_COUNT * DPS_TO_RAD_S

    accel_mag = np.linalg.norm(accel_ms2, axis=1)
    gyro_mag = np.linalg.norm(gyro_rad_s, axis=1)
    return accel_mag, gyro_mag


def downsample(signal: np.ndarray, factor: int) -> np.ndarray:
    return signal[::factor]


def make_window_features(accel_mag: np.ndarray, gyro_mag: np.ndarray) -> np.ndarray:
    """Stack (accel_mag, gyro_mag, accel jerk) into a (WINDOW_SIZE, 3) array."""
    jerk = np.diff(accel_mag, prepend=accel_mag[0]) * TARGET_HZ
    return np.stack([accel_mag, gyro_mag, jerk], axis=1)


def extract_windows(path: pathlib.Path, label: int) -> list[np.ndarray]:
    raw = load_file(path)
    if raw.shape[0] < DOWNSAMPLE_FACTOR * WINDOW_SIZE:
        return []

    accel_mag, gyro_mag = to_physical_units(raw)
    accel_mag = downsample(accel_mag, DOWNSAMPLE_FACTOR)
    gyro_mag = downsample(gyro_mag, DOWNSAMPLE_FACTOR)

    windows = []
    if label == 1:
        peak_idx = int(np.argmax(accel_mag))
        start = peak_idx - WINDOW_SIZE // 2
        start = max(0, min(start, len(accel_mag) - WINDOW_SIZE))
        end = start + WINDOW_SIZE
        windows.append(make_window_features(accel_mag[start:end], gyro_mag[start:end]))
    else:
        for start in range(0, len(accel_mag) - WINDOW_SIZE + 1, ADL_STRIDE):
            end = start + WINDOW_SIZE
            windows.append(make_window_features(accel_mag[start:end], gyro_mag[start:end]))
    return windows


def main() -> None:
    subject_dirs = sorted(p for p in DATASET_DIR.iterdir() if p.is_dir())
    print(f"Found {len(subject_dirs)} subject directories")

    all_windows: list[np.ndarray] = []
    all_labels: list[int] = []
    all_subjects: list[str] = []

    for subject_dir in subject_dirs:
        for file_path in sorted(subject_dir.glob("*.txt")):
            match = FILENAME_RE.match(file_path.name)
            if not match:
                continue
            activity_code, subject_id, _trial = match.groups()
            label = 1 if activity_code.startswith("F") else 0

            try:
                windows = extract_windows(file_path, label)
            except ValueError:
                print(f"  skipping malformed file: {file_path}")
                continue

            all_windows.extend(windows)
            all_labels.extend([label] * len(windows))
            all_subjects.extend([subject_id] * len(windows))

    x = np.stack(all_windows).astype(np.float32)
    y = np.array(all_labels, dtype=np.int64)
    subjects = np.array(all_subjects)

    print(f"Total windows: {len(y)} (falls={int(y.sum())}, adl={int((y == 0).sum())})")

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(OUTPUT_PATH, x=x, y=y, subjects=subjects)
    print(f"Saved to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
