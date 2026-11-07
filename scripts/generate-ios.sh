#!/usr/bin/env bash
set -eu
xcodegen generate --spec ios/project.yml
mkdir -p ios/LaReader.xcodeproj/project.xcworkspace/xcshareddata/swiftpm
cp ios/Package.resolved ios/LaReader.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved
