import 'dart:async';
import 'dart:collection';

import 'package:flutter_litert/flutter_litert.dart';

import 'fall_detector.dart' show FallEvent;

/// On-device fall classifier: a small 1D-CNN trained on the SisFall dataset
/// (see training/train.py), converted to TFLite and bundled as an asset.
///
/// Feeds a sliding 2-second window of (accel magnitude, gyro magnitude,
/// accel jerk) sampled at a fixed 50Hz into the model. The normalization
/// constants and window size below MUST match training/train.py exactly --
/// the model was fit to inputs on that scale.
class MlFallDetector {
  static const int windowSize = 100; // 2s @ 50Hz, matches training
  static const int sampleIntervalMs = 20; // 50Hz
  static const int inferenceStrideSamples = 5; // run inference every ~100ms

  // accel_mag [m/s^2], gyro_mag [rad/s], jerk [m/s^3]
  static const List<double> normScale = [30.0, 10.0, 500.0];

  // Raised from the 0.9/93.3% training default after real-device testing
  // showed a bare phone dropped onto a soft surface (e.g. a bed) can produce
  // an accel/jerk signature close to a body fall onto SisFall's padded test
  // mats. See training/README.md's "false positives" note before lowering
  // this back down.
  static const double positiveThreshold = 0.95;
  static const int consecutivePositivesRequired = 2;

  // A single fall spans many overlapping windows, so without a cooldown the
  // same fall fires several alerts in a row. Once triggered, stay silent for
  // this long before a new fall can be reported.
  static const Duration cooldown = Duration(seconds: 10);

  final Queue<List<double>> _window = Queue<List<double>>();
  double? _previousAccelMag;
  int _samplesSinceInference = 0;
  int _consecutivePositives = 0;
  DateTime? _cooldownUntil;

  Interpreter? _interpreter;

  final StreamController<FallEvent> _controller =
      StreamController<FallEvent>.broadcast();
  Stream<FallEvent> get events => _controller.stream;

  Future<void> load() async {
    _interpreter = await Interpreter.fromAsset('assets/model/fall_model.tflite');
  }

  /// Feed one fixed-rate sample (see [sampleIntervalMs]) of raw magnitudes.
  void addSample({
    required double accelMagnitude,
    required double gyroMagnitude,
    required DateTime timestamp,
  }) {
    final jerk = _previousAccelMag == null
        ? 0.0
        : (accelMagnitude - _previousAccelMag!) * (1000 / sampleIntervalMs);
    _previousAccelMag = accelMagnitude;

    _window.addLast([
      accelMagnitude / normScale[0],
      gyroMagnitude / normScale[1],
      jerk / normScale[2],
    ]);
    if (_window.length > windowSize) {
      _window.removeFirst();
    }
    if (_window.length < windowSize) return;

    if (_cooldownUntil != null) {
      if (timestamp.isBefore(_cooldownUntil!)) return;
      _cooldownUntil = null;
      _consecutivePositives = 0;
    }

    _samplesSinceInference++;
    if (_samplesSinceInference < inferenceStrideSamples) return;
    _samplesSinceInference = 0;

    final probability = _runInference();
    if (probability > positiveThreshold) {
      _consecutivePositives++;
      if (_consecutivePositives >= consecutivePositivesRequired) {
        _consecutivePositives = 0;
        _cooldownUntil = timestamp.add(cooldown);
        _controller.add(FallEvent(timestamp));
      }
    } else {
      _consecutivePositives = 0;
    }
  }

  double _runInference() {
    final interpreter = _interpreter;
    if (interpreter == null) return 0.0;

    final input = [_window.toList()];
    final output = [List.filled(1, 0.0)];
    interpreter.run(input, output);
    return output[0][0];
  }

  void dispose() {
    _interpreter?.close();
    _controller.close();
  }
}
