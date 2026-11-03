# Audit iOS và iPadOS — 1.2.1

## Lỗi tái hiện được

- EPUB trên WebKit: chạm đúng giữa sách hoặc trong hai cột không ẩn thanh điều khiển; Chromium vẫn chạy. Iframe có `sandbox="allow-same-origin"` khiến WebKit không chuyển sự kiện đến listener do ứng dụng cài từ cửa sổ cha. Thử cùng EPUB, cùng kích thước 1194×834 đã tái hiện lỗi trước sửa và xác nhận thao tác sau sửa.
- Vùng chuyển trang bị giới hạn tối đa 84 px mỗi bên, quá hẹp trên iPad.
- Thanh đọc kéo hết màn hình, bảng cài đặt cao hết cửa sổ và sidebar nhỏ chưa phù hợp với iPad mini/cửa sổ thu hẹp.

## Thay đổi

- Cho WebKit phát sự kiện tới listener của ứng dụng. Trước khi nạp EPUB, loại script, event handler, nội dung nhúng, điều hướng nguy hiểm và thêm CSP `script-src 'none'`, `connect-src 'none'`. Cho phép sự kiện trong iframe không đồng nghĩa chạy JavaScript của sách. Bài kiểm tra trình duyệt còn chèn script và event handler sau khi sách mở để xác nhận CSP vẫn chặn thực thi.
- Vùng trái/phải mỗi bên 30% chiều rộng vùng đọc; vùng giữa 40% ẩn/hiện điều khiển. Manga đảo hướng tương ứng. Tôn trọng chọn chữ, giữ tay lâu, cuộn dọc, liên kết và phóng to.
- iPad: nhóm quay lại và thao tác tách riêng; thanh đọc giữa màn hình rộng tối đa 660 px; nút ẩn thanh công cụ; cài đặt dạng popover ở góc phải. Cửa sổ hẹp dùng sheet; iPad mini dùng thanh điều hướng dạng biểu tượng. Các nút đọc có vùng chạm ít nhất 44 px.
- Dùng safe-area cho vùng đọc và điều khiển, cỡ chữ nhập liệu 16 px trên màn hình nhỏ để tránh zoom khi focus, popover cuộn bên trong. Giữ Giảm chuyển động và Giảm độ trong suốt.
- Kính mờ được dựng bằng CSS trong WebView; không sử dụng UIKit Liquid Glass. Tham khảo cách nhóm điều khiển trong [Adopting Liquid Glass của Apple](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass).

## Xác minh

- 72 kiểm thử Vitest; TypeScript và build web.
- 4 bài Playwright WebKit: chạm giữa/hai bên EPUB, bảo vệ script, xoay và thay đổi kích thước cửa sổ, CBZ hai trang. Chạy tự động trong GitHub Actions trước khi build native.
- 25 tình huống Chromium: lật/trượt/không animation, hai trang, manga, phóng to, vị trí đọc, dấu trang, thao tác chạm, offline và Giảm chuyển động.
- Xem ảnh thư viện, reader và cài đặt ở 1194×834, 834×1194, 744×1133, 600×834, 390×844; kiểm tra thêm 1366×1024 trong WebKit. Không tràn ngang hoặc tràn panel sau animation.

WebKit trên Windows với mô phỏng viewport/touch không thay thế WKWebView trên iPad thật. Cần cài IPA đã ký và kiểm tra trên máy thật, nhất là Apple Pencil, VoiceOver, Stage Manager, safe-area phần cứng và chọn văn bản của hệ điều hành.

## Chạy lại

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install --with-deps webkit
pnpm test
pnpm test:webkit
```

Sách cho kiểm thử được tạo trong bộ nhớ tại `e2e/fixtures.ts`; không nằm trong tài nguyên app hay thư viện mặc định.

Build đã xác minh: [GitHub Actions 41615282658](https://github.com/koyorinnn/la-reader/actions/runs/41615282658), mã nguồn `fc874e444f18400894147837ecd9df46b8c1aeb4`; APK và IPA 1.2.1 (build 5) đã tải về và kiểm tra.
