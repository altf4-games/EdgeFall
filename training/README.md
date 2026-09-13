# EdgeFall model training

Trains the on-device fall classifier bundled with the app at
[`assets/model/fall_model.tflite`](../assets/model/fall_model.tflite).

## Setup

```
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Dataset

Uses [SisFall](https://www.mdpi.com/1424-8220/17/1/198): 38 subjects (young
adults + elderly), accelerometer + gyroscope recordings of 19 ADL types and
15 fall types at 200 Hz. The original host (sistemic.udea.edu.co) is down;
this pipeline downloads a community mirror of the same dataset:

```
mkdir -p data
curl -L -o data/SisFall.zip \
  https://github.com/BIng2325/SisFall/releases/download/dataset/SisFall.zip
unzip data/SisFall.zip -d data/SisFall
unzip data/SisFall/SisFall_dataset.zip -d data/SisFall/dataset
```

This produces `data/SisFall/dataset/SisFall_dataset/<SUBJECT_ID>/*.txt`.

## Pipeline

```
python3 prepare_dataset.py   # -> data/windows.npz
python3 train.py             # -> output/fall_model.keras, ../assets/model/fall_model.tflite
```

`prepare_dataset.py` converts raw ADXL345 accelerometer + ITG3200 gyroscope
readings to physical units (m/s^2, rad/s), downsamples 200Hz -> 50Hz to match
what a phone streams via `sensors_plus`, and extracts fixed 2-second windows:
one impact-centered window per fall recording, and non-overlapping windows
across every ADL recording. Features are magnitude-based (not raw per-axis)
because a phone's orientation in a pocket has no fixed relationship to
SisFall's belt-mounted device, and magnitude is orientation-invariant.

`train.py` fits a small 1D-CNN (~3.4k params, ~12KB as TFLite) with
class-weighted loss to correct for the fall/ADL imbalance (~1.8k fall windows
vs ~26k ADL windows), then converts it to TFLite with default (dynamic-range)
quantization.

## Current results (subject-wise held-out test split)

At the operating point used in the app (`positiveThreshold = 0.9` in
`lib/services/ml_fall_detector.dart`): recall ~90%, precision ~59% per
2-second window. The app requires 2 consecutive positive windows
(`consecutivePositivesRequired`) before raising an alert, which sharply cuts
the effective false-positive rate in continuous use compared to a single
window's precision.

If you change `WINDOW_SIZE`, `NORM_SCALE`, or the feature set in
`prepare_dataset.py`/`train.py`, mirror those constants exactly in
`lib/services/ml_fall_detector.dart` — the model expects input on the exact
scale it was trained on.
