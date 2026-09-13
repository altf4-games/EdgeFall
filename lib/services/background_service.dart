import 'dart:async';
import 'dart:ui';

import 'package:flutter_background_service/flutter_background_service.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:sensors_plus/sensors_plus.dart';

import '../models/motion_sample.dart';
import 'fall_detector.dart';
import 'notification_service.dart';

const String fallEventChannel = 'fall_detected';

Future<void> initBackgroundService() async {
  final service = FlutterBackgroundService();

  await service.configure(
    androidConfiguration: AndroidConfiguration(
      onStart: _onServiceStart,
      autoStart: false,
      isForegroundMode: true,
      notificationChannelId: NotificationService.monitoringChannel.id,
      initialNotificationTitle: 'EdgeFall monitoring',
      initialNotificationContent: 'Watching for falls…',
      foregroundServiceNotificationId: 0,
    ),
    iosConfiguration: IosConfiguration(),
  );
}

@pragma('vm:entry-point')
void _onServiceStart(ServiceInstance service) async {
  DartPluginRegistrant.ensureInitialized();

  final fallDetector = FallDetector();
  final flutterLocalNotificationsPlugin = FlutterLocalNotificationsPlugin();
  const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
  await flutterLocalNotificationsPlugin
      .initialize(const InitializationSettings(android: androidInit));

  AccelerometerEvent? latestAccel;
  GyroscopeEvent? latestGyro;

  fallDetector.events.listen((event) async {
    await flutterLocalNotificationsPlugin.show(
      1,
      'Possible fall detected',
      'A sudden impact followed by stillness was detected. Tap to open EdgeFall.',
      const NotificationDetails(
        android: AndroidNotificationDetails(
          'edgefall_alert',
          'Fall alerts',
          channelDescription: 'Triggered when a possible fall is detected.',
          importance: Importance.max,
          priority: Priority.high,
          fullScreenIntent: true,
        ),
      ),
    );
    service.invoke(fallEventChannel, {
      'timestamp': event.timestamp.toIso8601String(),
    });
  });

  void maybeProcessSample() {
    if (latestAccel == null || latestGyro == null) return;
    final sample = MotionSample(
      timestamp: DateTime.now(),
      accelMagnitude: MotionSample.magnitude(
          latestAccel!.x, latestAccel!.y, latestAccel!.z),
      gyroMagnitude:
          MotionSample.magnitude(latestGyro!.x, latestGyro!.y, latestGyro!.z),
    );
    fallDetector.addSample(sample);
  }

  final accelSub = accelerometerEventStream(
    samplingPeriod: SensorInterval.gameInterval,
  ).listen((event) {
    latestAccel = event;
    maybeProcessSample();
  });

  final gyroSub = gyroscopeEventStream(
    samplingPeriod: SensorInterval.gameInterval,
  ).listen((event) {
    latestGyro = event;
  });

  service.on('stopService').listen((event) async {
    await accelSub.cancel();
    await gyroSub.cancel();
    fallDetector.dispose();
    await service.stopSelf();
  });
}
