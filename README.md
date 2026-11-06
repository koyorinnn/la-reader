# Lá Reader · Native

Ứng dụng đọc EPUB và CBZ offline, viết lại bằng **SwiftUI / UIKit cho iOS và iPadOS**, **Kotlin / Jetpack Compose cho Android**. Phiên bản 2.0.0, build 6.

Giao diện ứng dụng không phụ thuộc React, React Native, Capacitor hay một trang web. Bộ máy EPUB dùng [Readium Swift 3.11.1](https://github.com/readium/swift-toolkit/releases/tag/3.11.1) và [Readium Kotlin 3.4.0](https://github.com/readium/kotlin-toolkit/releases/tag/3.4.0). Nội dung HTML bên trong EPUB vẫn được Readium dàn trang bằng WebKit/Android WebView; thư viện, điều khiển, cài đặt và trình đọc ảnh CBZ là native.

- Nhập nhiều tệp từ Files / trình chọn tài liệu hệ thống; không có tài khoản hoặc sách mẫu.
- Sidebar iPad, bố cục co giãn theo cửa sổ, popover cài đặt. iOS 26 dùng `glassEffect` của hệ thống; iOS 17–18 dùng system material.
- EPUB và CBZ: một hoặc hai trang khi xoay ngang, tự về một trang khi đọc dọc.
- Hai bên 30% để chuyển trang, giữa 40% để ẩn/hiện điều khiển. Chọn chữ và liên kết EPUB do Readium xử lý.
- CBZ dùng ảnh native, phóng to bằng hai ngón, chiều manga, trang cuối lẻ; iOS dùng `UIPageViewController` với page curl. EPUB có hiệu ứng xoay ảnh trang, trượt hoặc tắt chuyển động.
- Lưu vị trí, dấu trang, cỡ chữ, giãn dòng, màu trang; không có máy chủ tải sách lên.

## Chạy và build

**iOS/iPadOS:** macOS, Xcode 26 trở lên, XcodeGen. `brew install xcodegen`, `xcodegen generate --spec ios/project.yml`, rồi mở `ios/LaReader.xcodeproj`, chọn scheme **LaReader**. App hỗ trợ iOS 17 trở lên. Muốn chạy trên thiết bị, bật ký mã và chọn team của bạn.

**Android:** JDK 21, Android SDK 37. Mở `android/` trong Android Studio hoặc chạy `cd android && ./gradlew testDebugUnitTest assembleDebug`. App hỗ trợ Android 8 trở lên.

**GitHub Actions:** workflow build SwiftUI trên macOS, chạy unit test và thao tác EPUB/CBZ trên iPad Simulator, xuất IPA chưa ký; Android chạy unit test, lint và xuất APK debug. IPA cần được ký lại trước khi cài. Một lần build thành công không thay thế việc thử trên thiết bị thật.

Đây là app native; localhost/Vite của bản cũ không hiển thị giao diện phiên bản 2.0. Dùng simulator hoặc cài bản build để xem giao diện mới.

## Dữ liệu bản cũ

Giữ bundle ID `app.la.reader`. Khi nâng cấp cùng chữ ký và giữ dữ liệu app, bản native đọc thư viện Capacitor cũ và sao chép sách vào kho mới, ghi chỉ mục nguyên tử; không xóa kho cũ. CBZ giữ số trang. EPUB đổi từ CFI của epub.js sang Locator của Readium, nên lần mở đầu khôi phục gần vị trí cũ theo phần trăm. Dấu trang CFI cũ được giữ nhưng chỉ khôi phục gần đúng; dấu trang tạo từ bản native dùng Locator chính xác. Gỡ app trước khi cài lại sẽ mất dữ liệu cục bộ.

Tệp không DRM, tối đa 100 MB nén / 300 MB giải nén / 40 MB mỗi mục / 5.000 mục. Cần giữ bản gốc của sách để sao lưu.

## Kiểm thử

`python3 scripts/make-fixtures.py` tạo sách thử riêng trong thư mục bị Git bỏ qua. CI chỉ chép chúng vào app iOS Debug khi `ENABLE_TEST_FIXTURES=YES`; archive Release không có các tệp này. Trình đọc thực được kiểm tra bằng XCTest/XCUITest, Android dùng JUnit và lint.

Mã nguồn Capacitor 1.2.1 được giữ ở nhánh `legacy/capacitor-1.2.1` để đối chiếu hoặc quay lại.
