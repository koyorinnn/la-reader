# Kiểm tra bản bàn giao

## Đã xác nhận

- TypeScript: `tsc -b` thành công.
- Vite production build: thành công.
- Vitest: 72/72 kiểm thử, gồm 24 kiểm thử EPUB/ZIP/CBZ, 22 kiểm thử lưu trữ, 15 kiểm thử bố cục CBZ 8 kiểm thử thao tác chạm/vuốt/ẩn thanh điều khiển và 3 kiểm thử bảo vệ tài liệu EPUB.
- Capacitor: đã tạo project Android và iOS, đồng bộ tài nguyên web cùng 3 plugin App, Filesystem, Preferences.
- Ảnh icon/splash iOS và Android đã thay bằng nhận diện sách mở; privacy manifest iOS được đưa vào Xcode Resources.

## Thao tác đã thử trong trình duyệt

Bản 1.2.1: đã tái hiện và sửa lỗi EPUB trên WebKit, qua 4 bài hồi quy WebKit và 25 tình huống Chromium; kiểm tra trực quan iPad ngang/dọc, iPad mini, cửa sổ hẹp và iPhone. Chi tiết và giới hạn kiểm tra ở [AUDIT-IOS.md](AUDIT-IOS.md).

Bản 1.2.0: 35 tình huống đã qua trên Edge/Chromium. Gồm EPUB hai cột thật, đổi một/hai trang, xoay màn hình, chạm bên trong iframe EPUB, vuốt/chạm CBZ, manga, trang cuối lẻ, phóng to, chạm liên tiếp, giữ tay lâu, ba kiểu hiệu ứng, Giảm chuyển động, lưu tuỳ chỉnh/dấu trang, đọc offline và đóng trình đọc giữa lúc lật. Kiểm tra mới xác nhận chạm giữa trang ẩn/hiện thanh công cụ, mở rộng vùng đọc, giữ khu vực đang đọc, chuyển trang khi toàn màn hình, xoay máy khi ẩn thanh công cụ, khôi phục bằng Escape hoặc bàn phím và luôn hiện điều khiển khi mở lại sách. Thanh ẩn dùng `inert` để loại các nút khỏi điều hướng bàn phím.

Không có ngoại lệ JavaScript. Đã xem ảnh thư viện trống/có sách, bảng kính mờ sáng/tối và trình đọc hiện/ẩn thanh công cụ. Bố cục không tràn ngang tại các chiều rộng 360, 390, 600, 601, 607, 768, 844 và 1180px. Các nút đọc có vùng chạm tối thiểu 44px. Sách dùng để kiểm tra được nhập riêng trong ngữ cảnh trình duyệt tạm; không đóng gói trong ứng dụng.

Bản web không có service worker: cần máy chủ để tải app lần đầu hoặc tải lại app. App native chứa sẵn tài nguyên web trong gói cài đặt.

## Build GitHub đã xác nhận

Bản 1.2.0: [lần chạy 41460894338](https://github.com/koyorinnn/la-reader/actions/runs/41460894338), mã nguồn `e7f146cef3ea3dd3d13c914415a584695fff649c`, đã qua 69 kiểm thử và cả ba job web/Android/iOS. APK và IPA tải về được đối chiếu SHA-256, kiểm tra ZIP và tài nguyên của bản mới: `epubLayout`, `pageAnimation`, `rd-footer-wide` cùng CSS kính mờ và chuyển động.

- Android: `app-debug.apk`, chứa manifest, executable và tài nguyên web.
- iOS: bản Simulator, archive thiết bị và `LaReader-unsigned.ipa`. IPA chứa `Payload/App.app`, bundle ID `app.la.reader`, phiên bản 1.2.0, build 4, nền tảng `iPhoneOS` và privacy manifest.
- Các gói không chứa sách mẫu. IPA chưa ký để cài lên thiết bị.

## Chưa xác nhận

Chưa có APK/AAB/IPA được biên dịch hoặc ký cục bộ. Môi trường hiện tại chưa có toolchain Android/Xcode được cấu hình để chạy bản native. Kiểm thử mobile trong trình duyệt không thay thế kiểm thử WebView và Filesystem trên thiết bị thật.

Chưa ký iOS, tạo AAB phát hành hoặc phân phối lên TestFlight/App Store/Play Store.

Trước khi phát hành, cần chạy iPhone/iPad và Android thật: nhập tệp qua Files/nhà cung cấp tài liệu, bộ nhớ với tệp lớn, xoay màn hình, mở lại app sau khi hệ điều hành đóng, các EPUB bên ngoài có font hoặc bố cục phức tạp, ký và phân phối.
