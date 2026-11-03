# Kiểm tra bản 1.2.1

## Đã xác nhận

- TypeScript: `tsc -b` kiểm tra cả ứng dụng, unit test và bộ Playwright.
- Vitest: 72/72 (24 EPUB/ZIP/CBZ, 22 lưu trữ, 15 bố cục CBZ, 8 thao tác chạm/vuốt, 3 bảo vệ tài liệu EPUB).
- Playwright WebKit: 4/4 bài qua cả cục bộ và GitHub Actions, gồm EPUB nhận touch thật ở giữa/hai bên, chặn script, xoay/cửa sổ hẹp và CBZ hai trang.
- Chromium: 25 tình huống đọc đã qua; không ghi nhận ngoại lệ JavaScript.
- Kiểm tra ảnh thư viện, trình đọc và bảng cài đặt ở 1194×834, 834×1194, 744×1133, 600×834, 390×844; bộ WebKit kiểm tra thêm 1366×1024. Xác nhận không tràn ngang/panel sau animation.
- Vite production build và Capacitor sync iOS/Android thành công.

Xem [AUDIT-IOS.md](AUDIT-IOS.md) để biết nguyên nhân lỗi EPUB trên WebKit, các sửa đổi giao diện iPad và cách chạy lại kiểm thử. Dữ liệu kiểm thử được tạo hoặc nhập trong trình duyệt tạm; app không kèm sách mẫu.

## Gói native

[GitHub Actions 41615282658](https://github.com/koyorinnn/la-reader/actions/runs/41615282658) chạy mã nguồn `fc874e444f18400894147837ecd9df46b8c1aeb4`. Cả ba job thành công: kiểm thử/web, APK Android debug, iOS Simulator/archive/IPA chưa ký.

APK và IPA tải về đã được đối chiếu SHA-256 của artifact và kiểm tra ZIP, tài nguyên web của bản sửa, CSP chặn script và nút ẩn thanh điều khiển. IPA xác nhận bundle ID `app.la.reader`, phiên bản 1.2.1, build 5, nền tảng iPhoneOS, `UIDeviceFamily` gồm iPhone và iPad, cùng privacy manifest.

## Giới hạn

WebKit trên Windows với viewport/touch mô phỏng không thay thế WKWebView trên thiết bị thật. Chưa chạy trên iPad/iPhone thật, chưa xác minh Apple Pencil, VoiceOver, bàn phím phần cứng, safe-area phần cứng, Stage Manager hoặc nhập tệp qua nhà cung cấp lưu trữ iOS.

IPA chưa ký; APK dùng khóa debug của runner. Chưa tạo AAB phát hành hoặc phân phối lên TestFlight/App Store/Play Store. Cần ký và thử trên thiết bị thật trước khi phát hành.

Bản web không có service worker: cần máy chủ để tải app. Bản native chứa tài nguyên web trong gói cài đặt; sách đã nhập được đọc offline.
