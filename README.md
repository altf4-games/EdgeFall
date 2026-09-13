# EdgeFall

On-device fall detection using only a phone's built-in accelerometer and
gyroscope — no wearable, no cloud, no network required. Detection runs
entirely on-device via a small TensorFlow Lite model.

Built and tested on a Nothing Phone (3a).

## How it works

The phone streams accelerometer + gyroscope data at a fixed 50Hz. A sliding
2-second window of three features — acceleration magnitude, gyroscope
magnitude, and acceleration jerk (rate of change) — is fed into a small
1D-CNN (~3.4k parameters, ~12KB as TFLite) running on-device via
[`flutter_litert`](https://pub.dev/packages/flutter_litert). The model was
trained on the [SisFall](https://www.mdpi.com/1424-8220/17/1/198) dataset
(38 subjects, accelerometer + gyroscope recordings of falls and everyday
activities).

Magnitudes are used instead of raw per-axis values because a phone's
orientation in a pocket or hand has no fixed relationship to how SisFall's
device was worn — magnitude is orientation-invariant.

To avoid one physical fall firing multiple alerts as the sliding window
passes over it, the detector requires two consecutive positive
classifications and then enters a 10-second cooldown before it can fire
again.

A background foreground-service keeps monitoring running when the app isn't
in the foreground, and a local notification (no SMS, no cloud, no external
service) is raised when a fall is detected — everything stays on-device.

See [`training/README.md`](training/README.md) for the model's accuracy
numbers, a known false-positive limitation (soft-surface drops), and how to
retrain it.

## Feasibility

The Nothing Phone (3a) has an accelerometer, gyroscope, and compass — no
barometer, but that's not required. Accelerometer + gyroscope is the
standard sensor combination used in published smartphone fall-detection
research, and on-device inference at this scale is well within a modern
phone's capability (the model is 12KB and inference runs many times a
second with room to spare).

## Project structure

```
lib/
  main.dart                        # UI: live sensor readout, monitoring toggle, fall history
  models/motion_sample.dart        # Shared magnitude helper
  services/
    fall_detector.dart             # Simpler rule-based (free-fall -> impact -> stillness) detector
    ml_fall_detector.dart          # Primary detector: TFLite classifier + cooldown
    background_service.dart        # Foreground service wiring sensors -> detector -> notification
    notification_service.dart      # Local notification channels and alerts
training/
  prepare_dataset.py               # Parses SisFall into labeled training windows
  train.py                         # Trains the 1D-CNN, exports assets/model/fall_model.tflite
  generate_icon.py                 # Generates the app icon assets
assets/
  model/fall_model.tflite          # Bundled trained classifier
  icon/                            # Launcher icon source images
```

## Running the app

Requires the Flutter SDK and an Android device or emulator.

```bash
flutter pub get
flutter run
```

To build a release APK:

```bash
flutter build apk --release
```

The latest built release is also published under
[Releases](https://github.com/altf4-games/EdgeFall/releases) as a sideloadable
APK.

## Retraining the model

See [`training/README.md`](training/README.md) for the full pipeline
(downloading SisFall, preparing windows, training, and exporting a new
`fall_model.tflite`).

## Known limitations

- Precision is ~59% per 2-second window at the app's operating threshold
  (recall ~90%) — expect occasional false alarms, particularly a bare phone
  dropped onto a soft surface (bed, couch), since SisFall's fall trials were
  themselves cushioned for subject safety. See
  [`training/README.md`](training/README.md#known-false-positives).
- Background execution on Android can be killed by aggressive battery
  optimization on some OEM skins; if monitoring stops unexpectedly, check
  the app's battery optimization exemption.
