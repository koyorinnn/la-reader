# Lá Reader

App đọc sách EPUB và truyện tranh CBZ offline, giao diện tiếng Việt. Mã nguồn React + TypeScript, đóng gói ứng dụng iOS và Android bằng Capacitor 8.

Phiên bản 1.2.1 sửa thao tác chạm EPUB trên WebKit và tối ưu iPad: nhóm điều khiển kính mờ, thanh đọc gọn ở giữa, popover cài đặt, sidebar thích ứng cửa sổ và iPad mini. Thư viện vẫn giữ nền gọn, không kèm sách mẫu. Hiệu ứng glass được dựng bằng CSS trong WebView cho cả iOS và Android.

- EPUB và CBZ đều chọn được một hoặc hai trang khi xoay ngang. EPUB dàn chữ thành hai trang, màn hình dọc tự trở về một trang.
- Chạm vùng trái/phải (30% mỗi bên) hoặc vuốt ngang để chuyển trang; chiều đọc manga đảo hướng tương ứng. Vùng giữa 40% dùng để ẩn/hiện thanh điều khiển.
- Chạm giữa trang để ẩn/hiện thanh điều khiển và mở rộng vùng đọc. Hoạt động với cả EPUB và CBZ; chạm hai bên vẫn chuyển trang khi đang đọc toàn màn hình. Nhấn Escape để hiện lại thanh công cụ, hoặc dùng nút hỗ trợ bàn phím **Hiện thanh điều khiển**.
- Chọn **Lật sách**, **Trượt** hoặc **Không** trong Cài đặt đọc. Hiệu ứng lật dùng nội dung trang thực và tự tắt khi thiết bị bật Giảm chuyển động.
- Khi chọn chữ, giữ tay lâu, mở bảng cài đặt hoặc phóng to truyện, thao tác chạm không làm chuyển nhầm trang.

Xem [kết quả audit iOS/iPadOS và cách chạy kiểm thử WebKit](AUDIT-IOS.md).

## Build trên GitHub

GitHub Actions đã chạy thành công cho bản 1.2.1: 72 kiểm thử, 4 bài WebKit, bản web, APK Android debug, iOS Simulator, archive và IPA iOS chưa ký. [Mở bản build đã xác minh](https://github.com/koyorinnn/la-reader/actions/runs/41615282658), tải các tệp trong **Artifacts**. Xem [hướng dẫn build và cài thử](GITHUB.md).

Workflow cũng xuất `LaReader-unsigned.ipa` trong artifact **la-reader-ios-unsigned-ipa**. Đây là IPA chưa ký để tự ký lại trước khi cài lên iPhone; tải từ [lần chạy mới nhất](https://github.com/koyorinnn/la-reader/actions/workflows/build.yml).

## Chạy trên máy tính

Cài Node.js 22 trở lên. Để dùng đúng các phiên bản thư viện trong `pnpm-lock.yaml`, mở terminal tại thư mục này và chạy:

```sh
npm install --global pnpm@11.25.0
pnpm install --frozen-lockfile
pnpm dev
```

Mở địa chỉ Vite in trong terminal. Thư viện bắt đầu trống; nhập tệp `.epub` hoặc `.cbz` từ thiết bị bằng nút **Nhập sách**. Nếu muốn dùng npm, `npm install` rồi `npm run dev` vẫn hoạt động, nhưng npm không sử dụng khóa phiên bản của pnpm; không dùng `npm ci` khi chưa có `package-lock.json`.

```sh
npm test
npm run build
npm run preview
```

`build` kiểm tra TypeScript và tạo tài nguyên sản xuất trong `dist/`. App đóng gói không cần kết nối mạng để mở sách đã nhập. Bản xem trên trình duyệt cần máy chủ Vite hoặc một máy chủ phục vụ `dist/`; đây không phải bản PWA đã đăng ký service worker.

## Android

Cần Android Studio, Android SDK và JDK phù hợp với Capacitor 8. Xem [yêu cầu môi trường chính thức](https://capacitorjs.com/docs/getting-started/environment-setup).

```sh
npm run build
npx cap sync android
npx cap open android
```

Thư mục `android/` đã được tạo sẵn. Trong Android Studio, chọn thiết bị hoặc emulator rồi Run. Dùng Build → Generate Signed App Bundle / APK để tạo bản phát hành; khóa ký và thông tin Play Console do chủ app cung cấp.

## iOS

Cần máy Mac và Xcode theo [yêu cầu Capacitor iOS](https://capacitorjs.com/docs/ios). Windows có thể phát triển và kiểm tra phần giao diện, nhưng không biên dịch ứng dụng iOS bằng Xcode.

```sh
npm run build
npx cap sync ios
npx cap open ios
```

Thư mục `ios/` đã được tạo sẵn. Trong Xcode, chọn development team, thay bundle ID `app.la.reader` thành ID riêng rồi chạy trên simulator hoặc iPhone. Archive và phân phối qua TestFlight/App Store cần tài khoản Apple Developer và cấu hình ký của chủ app.

Sau mỗi lần thay đổi mã nguồn, chạy `npm run build` và `npx cap sync` trước khi chạy lại native. Android và iOS đã biên dịch thành công trên GitHub Actions; bản iOS chưa ký và chưa kiểm thử trên thiết bị thật.

App đã có icon và màn hình khởi động riêng cho hai nền tảng. Tệp `ios/App/App/PrivacyInfo.xcprivacy` được đưa vào tài nguyên Xcode, khai báo UserDefaults với lý do `CA92.1` và FileTimestamp với lý do `C617.1`, theo tài liệu [Preferences](https://capacitorjs.com/docs/apis/preferences) và [Filesystem](https://capacitorjs.com/docs/apis/filesystem). Những khai báo này phản ánh việc lưu dữ liệu cục bộ của bản app hiện tại; cần xem lại khi thêm plugin hoặc chức năng thu thập dữ liệu.

## Phạm vi và dữ liệu

- Đọc EPUB không DRM; EPUB có JavaScript tương tác, nội dung cần mạng hoặc bố cục đặc biệt có thể không hiển thị như bản gốc.
- Đọc CBZ gồm ảnh JPG, JPEG, PNG, WebP, GIF, AVIF. Tên trang được sắp theo số tự nhiên, ví dụ 1, 2, 10.
- Khi đọc CBZ, màn hình dọc luôn hiển thị một trang. Trong cài đặt, chọn **Bố cục CBZ khi xoay ngang** là **Một trang** hoặc **Hai trang**; tùy chọn được lưu cho các lần đọc sau. Chế độ hai trang tuân theo chiều đọc trái sang phải hoặc phải sang trái (manga), và hiển thị riêng trang cuối nếu số trang lẻ.
- Giới hạn mỗi tệp nhập: 100 MB nén; tối đa 300 MB sau giải nén, 40 MB mỗi mục, 5.000 mục. Tệp ZIP64 và tệp mã hóa không được hỗ trợ.
- Sách, tiến độ, dấu trang và tùy chọn nằm trên thiết bị. Không có tài khoản, đồng bộ đám mây, quảng cáo hoặc máy chủ tải sách lên.
- Xóa dữ liệu ứng dụng hoặc gỡ ứng dụng sẽ làm mất bản sao sách và tiến độ. Hãy giữ tệp EPUB/CBZ gốc ở nơi khác. Trên trình duyệt, việc xóa dữ liệu trang cũng xóa thư viện.
- Thử nghiệm trên iPhone/iPad và Android thật vẫn cần thiết trước khi phát hành, nhất là tệp lớn, phông chữ nhúng, xoay màn hình và nhập tệp từ nhà cung cấp lưu trữ trên thiết bị.

## Cấu trúc

```text
src/                 Giao diện, thư viện sách và trình đọc
public/              Icon và tài nguyên giao diện
tests/               Kiểm thử xử lý tệp
android/             Dự án Android Studio
ios/                 Dự án Xcode và privacy manifest
capacitor.config.ts  Cấu hình ứng dụng iOS/Android
```

Thư viện chính: [Capacitor](https://capacitorjs.com/docs), [epub.js](https://github.com/futurepress/epub.js), [fflate](https://github.com/101arrowz/fflate), React và Vite. Xem giấy phép của các gói trước khi phân phối.
