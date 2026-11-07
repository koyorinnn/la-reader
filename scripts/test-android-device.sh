#!/usr/bin/env bash
set -u
cd android
./gradlew --no-daemon connectedDebugAndroidTest
result=$?
mkdir -p ../artifacts/android-screenshots
adb pull /sdcard/Download/la-reader-tests ../artifacts/android-screenshots || true
adb logcat -d > ../artifacts/android-screenshots/logcat.txt
exit "$result"
