# Native rebuild verification

Version 2.0.0 (6). Build verification: [GitHub Actions run 42653601283](https://github.com/koyorinnn/la-reader/actions/runs/42653601283), app commit `9acd6b4fe16fd55cbaf18eb452dc0c42812be04f`, 9 November 2026.

The baseline run passed all 18 automated tests, Android lint/build and the iOS Release archive. Both device packages were downloaded and inspected on 10 November 2026. Screenshot review then exposed an EPUB rotation regression that the original test did not catch. The current source preserves the locator during reflow and adds a mid-chapter rotation/reopen assertion; this follow-up build is still being verified. The hashes below identify the baseline packages, not the pending fix.

The native source lives at repository root: `ios/` contains SwiftUI/UIKit, `android/` contains Kotlin/Compose. React, Capacitor, epub.js, and a web build are not dependencies of either app.

The previous Capacitor version remains on `legacy/capacitor-1.2.1`. The native implementation was built and tested on `native-rebuild` before promotion to `main`.

| Check | Result | Coverage |
| --- | --- | --- |
| iOS unit tests | 6 passed | Proportional tap zones, portrait/narrow-window page policy, contiguous comic spreads, malformed ZIP rejection, storage identifiers, corrupt-index preservation |
| iPad UI tests | 2 passed | Real EPUB/CBZ rendering, center tap to hide/show controls, 25%/75% page-turn taps, landscape/portrait EPUB, settings, two-page comics and reopen position |
| iPhone UI tests | 2 passed | Same native EPUB/CBZ interactions on the phone layout |
| Android unit tests | 6 passed | Tap zones, page policy, odd comic spreads, ZIP validation/traversal, bookmark and progress serialization |
| Android tablet UI tests | 2 passed | Open EPUB/CBZ from the native library, hide/show controls, page turns, settings, two-page comics and reopen position |
| Android build and lint | Passed | Installable debug APK, minimum API 26 / target API 37 |
| iOS Release archive | Passed | Unsigned arm64 device IPA for iPhone and iPad, minimum iOS 17 |

The Apple tests ran on iPad Pro 13-inch (M5) and iPhone 17 Pro simulators using iOS 26.5 and Xcode 26.6. The Android instrumentation tests ran on a Pixel Tablet emulator, Android 15 / API 35. Android screenshots were inspected for the EPUB two-column layout, comic spread and settings panel.

The downloaded APK was checked independently of the build log: package `app.la.reader`, version `2.0.0` / build `6`, no `INTERNET` permission, not `testOnly`, and no EPUB/CBZ fixtures or Capacitor assets. APK SHA-256: `e825615b34f8fd8ef858fa7ce5c268cdb7518bc15bbe1d4cffa94b095675c2bd`.

The downloaded IPA contains an arm64 `iPhoneOS` executable, bundle `app.la.reader`, version `2.0.0` / build `6`, and device families 1 and 2. It contains no signing profile, code signature, test publications, or Capacitor assets. IPA SHA-256: `94e97ea2581a8300d329af009b627dc3822947878b1079e3d8574c95904dae1b`.

XCUITest and Android instrumentation open generated publications through the real reader. Test books are private test inputs, not library content shipped in the device apps. The iOS workflow enables fixtures only for Debug tests and disables them for the Release archive.

The APK is a development build. The IPA is unsigned and needs a suitable signing certificate and provisioning profile before installation. Neither artifact has been submitted to a store.

Hardware testing is still required before distributing through TestFlight/App Store or Google Play. Simulator results do not establish behavior on a physical device, actual iCloud/Files providers, ProMotion, Apple Pencil, or all publisher-authored EPUB layouts. Animation timing and migration from a previously signed installation have not been validated on physical hardware.
