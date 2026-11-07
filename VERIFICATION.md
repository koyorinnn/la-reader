# Native rebuild verification

Version 2.0.0 (6). Verification is still in progress; a green native workflow and the final downloaded artifacts will be recorded here before delivery.

The native source lives at repository root: `ios/` contains SwiftUI/UIKit, `android/` contains Kotlin/Compose. React, Capacitor, epub.js, and a web build are not dependencies of either app.

The previous working Capacitor version remains on `legacy/capacitor-1.2.1`. The rewrite is being built on `native-rebuild`; main will only be updated after native build and device tests pass.

Automated checks cover proportional tap zones, portrait/landscape page counts, odd final comic spreads, invalid ZIP rejection, persistent bookmarks, and a protected corrupt library index. XCUITest opens original generated EPUB/CBZ publications on an iPad and an iPhone simulator. Android instrumentation runs the same formats on a tablet emulator. The fixtures are test inputs; they are not included in the device IPA or the Android app APK.

Hardware testing is still required before distributing through TestFlight/App Store or Google Play. Simulator results do not establish behavior on a physical device, actual iCloud/Files providers, ProMotion, Apple Pencil, or all publisher-authored EPUB layouts.
