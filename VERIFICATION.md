# Kiểm tra bản bàn giao

## Đã xác nhận

- TypeScript: `tsc --noEmit` thành công.
- Vite production build: thành công.
- Vitest: 61/61 kiểm thử, gồm 24 kiểm thử EPUB/ZIP/CBZ, 22 kiểm thử lưu trữ và 15 kiểm thử bố cục CBZ.
- Capacitor: đã tạo project Android và iOS, đồng bộ tài nguyên web cùng 3 plugin App, Filesystem, Preferences.
- Ảnh icon/splash iOS và Android đã thay bằng nhận diện sách mở; privacy manifest iOS được đưa vào Xcode Resources.

## Thao tác đã thử trong trình duyệt

Edge/Chromium tự động. Lượt kiểm tra trước đã xác nhận nhập tệp, phân trang EPUB, tìm kiếm, xóa sách và lưu dữ liệu. Lượt kiểm tra mới với Liquid Glass và CBZ hai trang xác nhận 17 tình huống dưới đây trên desktop 1440px, mobile 390px/360px và landscape 844×390:

1. Không còn khu sách mẫu hoặc request tải sách mẫu.
2. Thanh điều hướng Liquid Glass có hiệu ứng blur.
3. Màn hình dọc chỉ hiển thị một trang.
4. Chọn hai trang khi nằm ngang, hiển thị cặp đầu.
5. Chuyển tới cặp kế tiếp và lưu vị trí.
6. Phóng to vẫn giữ hai trang.
7. Trang cuối lẻ hiện riêng, nút tiếp bị vô hiệu hóa.
8. Xoay màn hình giữ đúng trang vừa chọn.
9. Xoay ngang lại khôi phục lựa chọn hai trang.
10. Chọn một trang khi nằm ngang, chuyển từng trang.
11. RTL đảo vị trí hai trang và hướng phím điều khiển.
12. Tải lại app giữ bố cục, vị trí, dấu trang và RTL.
13. Chuyển trang khi ngắt mạng.
14. CBZ chỉ có một trang hoạt động đúng ở chế độ hai trang.
15. Tự dọn dữ liệu sách mẫu cũ và giữ sách người dùng đã nhập.
16. Giao diện 360px không tràn ngang.
17. Nội dung EPUB vẫn hiển thị đúng sau thay đổi.

Không ghi nhận ngoại lệ JavaScript trong lượt kiểm tra cuối. Bản web không có service worker: cần máy chủ để tải app lần đầu hoặc tải lại app. App native chứa sẵn tài nguyên web trong gói cài đặt.

## Build GitHub đã xác nhận

Đã kiểm tra [lần chạy 40907874320](https://github.com/koyorinnn/la-reader/actions/runs/40907874320), mã nguồn `c18ca2a7246d60a35fa7c6ee2e45014cc39b2ee5`. Cả ba job hoàn tất thành công:

- Tests and web build: 61 kiểm thử và production build.
- Android debug APK: đã biên dịch và tải lên `la-reader-android-debug` chứa `app-debug.apk`.
- iOS simulator and unsigned archive: đã biên dịch bản Simulator và archive thiết bị chưa ký, tải lên `la-reader-ios`.

Lần chạy đầu gặp lỗi công cụ Android SDK chưa nằm trong PATH. Workflow hiện cài SDK tools trước khi gọi `sdkmanager`; lần chạy trên đã xác nhận bản sửa.

Lần chạy bổ sung [41003932498](https://github.com/koyorinnn/la-reader/actions/runs/41003932498), mã nguồn `d35331cade1af60026a6e8f778b32978fdec54c6`, đã hoàn tất cả ba job và tạo thêm `LaReader-unsigned.ipa`. Đã tải artifact, đối chiếu SHA-256 với GitHub, kiểm tra ZIP, cấu trúc `Payload/App.app`, executable Mach-O, nền tảng `iPhoneOS`, bundle ID, tài nguyên web và privacy manifest. File này chưa được ký để cài lên thiết bị.

## Chưa xác nhận

Chưa có APK/AAB/IPA được biên dịch hoặc ký cục bộ. Môi trường hiện tại chưa có toolchain Android/Xcode được cấu hình để chạy bản native. Kiểm thử mobile trong trình duyệt không thay thế kiểm thử WebView và Filesystem trên thiết bị thật.

Chưa ký iOS, tạo AAB phát hành hoặc phân phối lên TestFlight/App Store/Play Store.

Trước khi phát hành, cần chạy iPhone/iPad và Android thật: nhập tệp qua Files/nhà cung cấp tài liệu, bộ nhớ với tệp lớn, xoay màn hình, mở lại app sau khi hệ điều hành đóng, các EPUB bên ngoài có font hoặc bố cục phức tạp, ký và phân phối.
