#!/usr/bin/env bash
set -u
cd android
./gradlew --no-daemon connectedDebugAndroidTest
result=$?
mkdir -p ../artifacts/android-screenshots
adb pull /sdcard/Android/data/app.la.reader/files/screenshots ../artifacts/android-screenshots || true
exit "$result"
