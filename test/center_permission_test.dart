import 'package:flutter_test/flutter_test.dart';
import 'package:tabibak_center/main.dart';

void main() {
  group('Center UI permission gating', () {
    test('no signed-in member receives no permissions', () {
      final state = Db()..me = null;

      expect(state.isManager, isFalse);
      for (var permission = 0; permission < 4; permission++) {
        expect(state.can(permission), isFalse);
      }
    });

    test('inactive member receives no permissions, including manager access', () {
      final state = Db();
      final manager = Member('مدير', '+249912345678', 0, active: false);
      state.members
        ..clear()
        ..add(manager);
      state.me = manager;

      expect(state.isManager, isFalse);
      expect(state.can(0), isFalse);
      expect(state.can(3), isFalse);
    });

    test('reception member receives only explicitly assigned permissions', () {
      final state = Db();
      final reception = Member('استقبال', '+249912345678', 1, perms: {0});
      state.members
        ..clear()
        ..add(reception);
      state.me = reception;

      expect(state.isManager, isFalse);
      expect(state.can(0), isTrue);
      expect(state.can(1), isFalse);
      expect(state.can(2), isFalse);
      expect(state.can(3), isFalse);
    });

    test('active manager receives all UI permissions', () {
      final state = Db();
      final manager = Member('مدير', '+249912345678', 0);
      state.members
        ..clear()
        ..add(manager);
      state.me = manager;

      expect(state.isManager, isTrue);
      for (var permission = 0; permission < 4; permission++) {
        expect(state.can(permission), isTrue);
      }
    });
  });
}
