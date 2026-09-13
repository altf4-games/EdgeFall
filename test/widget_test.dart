import 'package:flutter_test/flutter_test.dart';

import 'package:edgefall/main.dart';

void main() {
  testWidgets('EdgeFall shows monitoring controls', (WidgetTester tester) async {
    await tester.pumpWidget(const EdgeFallApp());

    expect(find.text('EdgeFall'), findsOneWidget);
    expect(find.text('Start monitoring'), findsOneWidget);
    expect(find.text('Fall history'), findsOneWidget);
  });
}
