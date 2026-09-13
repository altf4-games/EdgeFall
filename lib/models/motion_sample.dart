import 'dart:math';

/// One synchronized reading of accelerometer + gyroscope magnitudes.
class MotionSample {
  final DateTime timestamp;
  final double accelMagnitude; // m/s^2, includes gravity
  final double gyroMagnitude; // rad/s

  MotionSample({
    required this.timestamp,
    required this.accelMagnitude,
    required this.gyroMagnitude,
  });

  static double magnitude(double x, double y, double z) {
    return sqrt(x * x + y * y + z * z);
  }
}
