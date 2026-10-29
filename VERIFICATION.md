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

## Chưa xác nhận

Chưa có APK/AAB/IPA được biên dịch hoặc ký cục bộ. Môi trường hiện tại chưa có toolchain Android/Xcode được cấu hình để chạy bản native. Kiểm thử mobile trong trình duyệt không thay thế kiểm thử WebView và Filesystem trên thiết bị thật.

Đã chuẩn bị GitHub Actions với job kiểm thử/web, APK Android debug, iOS Simulator và archive iOS chưa ký. Xem kết quả thực tế tại [GitHub Actions](https://github.com/koyorinnn/la-reader/actions). Cấu hình workflow không thay thế kết quả build thành công.

Trước khi phát hành, cần chạy iPhone/iPad và Android thật: nhập tệp qua Files/nhà cung cấp tài liệu, bộ nhớ với tệp lớn, xoay màn hình, mở lại app sau khi hệ điều hành đóng, các EPUB bên ngoài có font hoặc bố cục phức tạp, ký và phân phối.
