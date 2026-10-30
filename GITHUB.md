# Đưa Lá Reader lên GitHub và build

Thư mục chứa `package.json`, `android/`, `ios/` và `.github/` phải nằm ở **gốc repository**. Workflow có sẵn trong `.github/workflows/build.yml`.

## Đẩy mã nguồn

Repository của dự án: [koyorinnn/la-reader](https://github.com/koyorinnn/la-reader). Để tiếp tục phát triển, tải mã nguồn bằng Git:

```sh
git clone https://github.com/koyorinnn/la-reader.git
cd la-reader
pnpm install --frozen-lockfile
pnpm dev
```

Đăng nhập GitHub qua Git Credential Manager hoặc GitHub CLI trên máy để đẩy thay đổi. Không dán token vào mã nguồn. Nếu dùng giao diện Upload files cho một repo khác, cần đưa **toàn bộ nội dung thư mục**, gồm `.github`, lên gốc repo; chỉ tải file ZIP lên sẽ không kích hoạt build.

## Chạy build và tải kết quả

Workflow tự chạy khi push vào `main`/`master`, khi mở pull request, hoặc chạy thủ công tại **Actions → Build La Reader → Run workflow**.

Sau khi workflow thành công, mở lần chạy đó và tải **Artifacts**:

| Artifact | Nội dung | Cách dùng |
| --- | --- | --- |
| `la-reader-android-debug` | `app-debug.apk` | Cài thử trên Android; Android yêu cầu cho phép cài app từ nguồn tương ứng. |
| `la-reader-ios` | App cho iOS Simulator và `.xcarchive` chưa ký | Simulator chạy trên Mac. Archive thiết bị cần ký bằng Apple Developer để cài lên iPhone/phân phối. |
| `la-reader-ios-unsigned-ipa` | `LaReader-unsigned.ipa` | App thiết bị đóng gói theo cấu trúc `Payload/App.app`; cần ký lại bằng công cụ của bạn trước khi cài. |
| `la-reader-web` | Thư mục web production | Phục vụ bằng HTTP; không mở `index.html` trực tiếp bằng `file://`. |

APK dùng khóa debug của runner, không phải bản phát hành Play Store. Khóa có thể thay đổi giữa các lần build; có thể cần gỡ bản debug cũ trước khi cài bản mới. Gỡ app làm mất thư viện trong app, nên giữ tệp sách gốc.

Workflow tạo IPA chưa ký trực tiếp trên máy Mac của GitHub, không cần đưa chứng chỉ lên repo. Tải artifact `la-reader-ios-unsigned-ipa`, giải nén ZIP tải về để lấy `LaReader-unsigned.ipa`, rồi dùng công cụ ký/cài của bạn. IPA này chứa bản biên dịch cho thiết bị thật, không phải bản Simulator; đổi đuôi file không làm IPA được ký và không thể cài trực tiếp lên iPhone khi chưa ký.

Muốn GitHub xuất IPA đã ký, cần cấu hình chứng chỉ cùng khóa riêng, provisioning profile và kiểu phân phối tương ứng. Lưu thông tin ký trong GitHub Actions Secrets, không commit vào repo. Phát hành còn cần cấu hình bundle ID, version và tài khoản phân phối của chủ app.

## Môi trường CI

- Web: Ubuntu 24.04, Node 24, pnpm 11.25.0, cài theo lockfile và chạy toàn bộ kiểm thử trước khi build native.
- Android: JDK 21, SDK 36, Gradle wrapper kèm repo.
- iOS: runner `macos-26`, Swift Package Manager và Xcode có sẵn; scheme `App` đã được chia sẻ trong repo.
- Mỗi artifact được giữ 14 ngày; cấu hình có thể thay đổi trong workflow. Quyền workflow chỉ đọc mã nguồn và tải artifact qua dịch vụ Actions.

Tài liệu tham chiếu: [môi trường Capacitor](https://capacitorjs.com/docs/getting-started/environment-setup), [runner macOS](https://github.com/actions/runner-images/blob/main/images/macos/macos-26-arm64-Readme.md), [artifact GitHub Actions](https://github.com/actions/upload-artifact).

## Trạng thái xác minh

Đã xác nhận cả ba job thành công tại [lần chạy 40907874320](https://github.com/koyorinnn/la-reader/actions/runs/40907874320), mã nguồn `c18ca2a7246d60a35fa7c6ee2e45014cc39b2ee5`. Các artifact Android, iOS và web đã được tạo. Đăng nhập GitHub để tải trong mục **Artifacts**; nếu artifact hết hạn, chạy lại workflow. Xem `VERIFICATION.md` để biết phạm vi kiểm tra.
