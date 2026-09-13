import 'package:flutter_local_notifications/flutter_local_notifications.dart';

class NotificationService {
  static final FlutterLocalNotificationsPlugin _plugin =
      FlutterLocalNotificationsPlugin();

  static const AndroidNotificationChannel monitoringChannel =
      AndroidNotificationChannel(
    'edgefall_monitoring',
    'Fall monitoring',
    description: 'Shows that EdgeFall is actively watching for falls.',
    importance: Importance.low,
  );

  static const AndroidNotificationChannel alertChannel =
      AndroidNotificationChannel(
    'edgefall_alert',
    'Fall alerts',
    description: 'Triggered when a possible fall is detected.',
    importance: Importance.max,
  );

  static Future<void> init() async {
    const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
    const initSettings = InitializationSettings(android: androidInit);
    await _plugin.initialize(initSettings);

    final androidPlugin = _plugin.resolvePlatformSpecificImplementation<
        AndroidFlutterLocalNotificationsPlugin>();
    await androidPlugin?.createNotificationChannel(monitoringChannel);
    await androidPlugin?.createNotificationChannel(alertChannel);
    await androidPlugin?.requestNotificationsPermission();
  }

  static Future<void> showFallAlert(DateTime timestamp) async {
    await _plugin.show(
      1,
      'Possible fall detected',
      'A sudden impact followed by stillness was detected at '
          '${timestamp.hour.toString().padLeft(2, '0')}:'
          '${timestamp.minute.toString().padLeft(2, '0')}:'
          '${timestamp.second.toString().padLeft(2, '0')}. Tap to open EdgeFall.',
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
  }

  static Future<void> showMonitoringStatus(String message) async {
    await _plugin.show(
      0,
      'EdgeFall monitoring',
      message,
      const NotificationDetails(
        android: AndroidNotificationDetails(
          'edgefall_monitoring',
          'Fall monitoring',
          channelDescription:
              'Shows that EdgeFall is actively watching for falls.',
          importance: Importance.low,
          priority: Priority.low,
          ongoing: true,
          onlyAlertOnce: true,
        ),
      ),
    );
  }

  static Future<void> cancelMonitoringStatus() async {
    await _plugin.cancel(0);
  }
}
