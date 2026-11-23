// Generated-style Firebase options for Tabebik Center.
// Android is configured through android/app/google-services.json.
import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;
import 'package:flutter/foundation.dart' show defaultTargetPlatform, TargetPlatform;

class DefaultFirebaseOptions {
  static FirebaseOptions get currentPlatform {
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return android;
      default:
        throw UnsupportedError(
          'DefaultFirebaseOptions are not configured for this platform.',
        );
    }
  }

  static const FirebaseOptions android = FirebaseOptions(
    apiKey: 'AIzaSyA_9bYseIXkNAxuM3TQP9RXGUqCh37XPrk',
    appId: '1:50266299347:android:e9f5fa2b493b4a6cb32d26',
    messagingSenderId: '50266299347',
    projectId: 'tabibek-2f25e',
    storageBucket: 'tabibek-2f25e.firebasestorage.app',
  );
}
