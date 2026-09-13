import 'dart:async';

import '../models/motion_sample.dart';

enum _FallState { idle, freeFall, impact }

class FallEvent {
  final DateTime timestamp;
  FallEvent(this.timestamp);
}

/// Threshold-based fall detector using the classic
/// free-fall -> impact -> post-impact-stillness state machine.
///
/// Accelerometer magnitude is ~9.8 m/s^2 at rest (includes gravity).
/// A fall briefly nears 0 (free fall), spikes sharply on impact, then
/// settles back near 9.8 with little further movement if the person
/// stays down — that stillness check is what separates a fall from
/// just dropping the phone.
class FallDetector {
  static const double freeFallThreshold = 3.0;
  static const double impactThreshold = 25.0;
  static const Duration freeFallToImpactWindow = Duration(milliseconds: 1500);
  static const double stillAccelLow = 7.5;
  static const double stillAccelHigh = 11.5;
  static const double stillGyroThreshold = 0.6;
  static const Duration stillnessWindow = Duration(milliseconds: 1500);

  _FallState _state = _FallState.idle;
  DateTime? _freeFallTime;
  DateTime? _impactTime;
  final List<MotionSample> _postImpactSamples = [];

  final StreamController<FallEvent> _controller =
      StreamController<FallEvent>.broadcast();
  Stream<FallEvent> get events => _controller.stream;

  void addSample(MotionSample sample) {
    switch (_state) {
      case _FallState.idle:
        if (sample.accelMagnitude < freeFallThreshold) {
          _state = _FallState.freeFall;
          _freeFallTime = sample.timestamp;
        }
        break;

      case _FallState.freeFall:
        if (sample.timestamp.difference(_freeFallTime!) >
            freeFallToImpactWindow) {
          _reset();
          break;
        }
        if (sample.accelMagnitude > impactThreshold) {
          _state = _FallState.impact;
          _impactTime = sample.timestamp;
          _postImpactSamples.clear();
        }
        break;

      case _FallState.impact:
        if (sample.timestamp.difference(_impactTime!) > stillnessWindow) {
          final isStill = _postImpactSamples.isNotEmpty &&
              _postImpactSamples.every((s) =>
                  s.accelMagnitude > stillAccelLow &&
                  s.accelMagnitude < stillAccelHigh &&
                  s.gyroMagnitude < stillGyroThreshold);
          if (isStill) {
            _controller.add(FallEvent(sample.timestamp));
          }
          _reset();
          break;
        }
        _postImpactSamples.add(sample);
        break;
    }
  }

  void _reset() {
    _state = _FallState.idle;
    _freeFallTime = null;
    _impactTime = null;
    _postImpactSamples.clear();
  }

  void dispose() => _controller.close();
}
