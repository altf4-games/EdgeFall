import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_background_service/flutter_background_service.dart';
import 'package:sensors_plus/sensors_plus.dart';

import 'models/motion_sample.dart';
import 'services/background_service.dart';
import 'services/notification_service.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await NotificationService.init();
  await initBackgroundService();
  runApp(const EdgeFallApp());
}

class EdgeFallApp extends StatelessWidget {
  const EdgeFallApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'EdgeFall',
      theme: ThemeData(
        colorSchemeSeed: Colors.deepOrange,
        brightness: Brightness.dark,
        useMaterial3: true,
      ),
      home: const MonitorPage(),
    );
  }
}

class MonitorPage extends StatefulWidget {
  const MonitorPage({super.key});

  @override
  State<MonitorPage> createState() => _MonitorPageState();
}

class _MonitorPageState extends State<MonitorPage> {
  StreamSubscription<AccelerometerEvent>? _accelSub;
  StreamSubscription<GyroscopeEvent>? _gyroSub;
  StreamSubscription<Map<String, dynamic>?>? _fallSub;

  double _accelMagnitude = 0;
  double _gyroMagnitude = 0;
  bool _monitoring = false;
  final List<DateTime> _fallHistory = [];

  @override
  void initState() {
    super.initState();
    _subscribeToRawSensors();
    try {
      _fallSub = FlutterBackgroundService()
          .on(fallEventChannel)
          .listen(_onFallDetected);
      FlutterBackgroundService().isRunning().then((running) {
        if (mounted) setState(() => _monitoring = running);
      });
    } catch (_) {
      // Background service plugin unavailable (e.g. running in a test host).
    }
  }

  void _subscribeToRawSensors() {
    try {
      _accelSub = accelerometerEventStream(
        samplingPeriod: SensorInterval.uiInterval,
      ).listen((event) {
        if (!mounted) return;
        setState(() {
          _accelMagnitude =
              MotionSample.magnitude(event.x, event.y, event.z);
        });
      });
      _gyroSub = gyroscopeEventStream(
        samplingPeriod: SensorInterval.uiInterval,
      ).listen((event) {
        if (!mounted) return;
        setState(() {
          _gyroMagnitude =
              MotionSample.magnitude(event.x, event.y, event.z);
        });
      });
    } catch (_) {
      // Sensor plugin unavailable (e.g. running in a test host).
    }
  }

  void _onFallDetected(Map<String, dynamic>? event) {
    if (event == null) return;
    final timestamp = DateTime.parse(event['timestamp'] as String);
    setState(() => _fallHistory.insert(0, timestamp));
    if (mounted) {
      showDialog(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Possible fall detected'),
          content: Text(
              'A fall-like impact was detected at ${_formatTime(timestamp)}.'),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('OK'),
            ),
          ],
        ),
      );
    }
  }

  Future<void> _toggleMonitoring() async {
    final service = FlutterBackgroundService();
    if (_monitoring) {
      service.invoke('stopService');
      await NotificationService.cancelMonitoringStatus();
      setState(() => _monitoring = false);
    } else {
      await service.startService();
      setState(() => _monitoring = true);
    }
  }

  String _formatTime(DateTime t) =>
      '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}:${t.second.toString().padLeft(2, '0')}';

  @override
  void dispose() {
    _accelSub?.cancel();
    _gyroSub?.cancel();
    _fallSub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('EdgeFall')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Live sensor readout',
                        style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 12),
                    Text(
                        'Accelerometer magnitude: ${_accelMagnitude.toStringAsFixed(2)} m/s²'),
                    Text(
                        'Gyroscope magnitude: ${_gyroMagnitude.toStringAsFixed(2)} rad/s'),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: _toggleMonitoring,
              icon: Icon(_monitoring ? Icons.stop : Icons.play_arrow),
              label: Text(
                  _monitoring ? 'Stop monitoring' : 'Start monitoring'),
            ),
            const SizedBox(height: 24),
            Text('Fall history', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            Expanded(
              child: _fallHistory.isEmpty
                  ? const Center(child: Text('No falls detected yet.'))
                  : ListView.builder(
                      itemCount: _fallHistory.length,
                      itemBuilder: (context, index) => ListTile(
                        leading: const Icon(Icons.warning_amber_rounded,
                            color: Colors.orange),
                        title: Text(_formatTime(_fallHistory[index])),
                      ),
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
