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
| `la-reader-web` | Thư mục web production | Phục vụ bằng HTTP; không mở `index.html` trực tiếp bằng `file://`. |

APK dùng khóa debug của runner, không phải bản phát hành Play Store. Khóa có thể thay đổi giữa các lần build; có thể cần gỡ bản debug cũ trước khi cài bản mới. Gỡ app làm mất thư viện trong app, nên giữ tệp sách gốc.

Workflow chưa cần secret ký. Không tạo IPA giả hoặc IPA chưa ký để cài trực tiếp lên iPhone. Để phát hành cần cấu hình bundle ID, version, keystore Android hoặc chứng chỉ/provisioning profile Apple của chủ app.

## Môi trường CI

- Web: Ubuntu 24.04, Node 24, pnpm 11.25.0, cài theo lockfile và chạy toàn bộ kiểm thử trước khi build native.
- Android: JDK 21, SDK 36, Gradle wrapper kèm repo.
- iOS: runner `macos-26`, Swift Package Manager và Xcode có sẵn; scheme `App` đã được chia sẻ trong repo.
- Mỗi artifact được giữ 14 ngày; cấu hình có thể thay đổi trong workflow. Quyền workflow chỉ đọc mã nguồn và tải artifact qua dịch vụ Actions.

Tài liệu tham chiếu: [môi trường Capacitor](https://capacitorjs.com/docs/getting-started/environment-setup), [runner macOS](https://github.com/actions/runner-images/blob/main/images/macos/macos-26-arm64-Readme.md), [artifact GitHub Actions](https://github.com/actions/upload-artifact).

## Trạng thái xác minh

Workflow được chuẩn bị trong mã nguồn. Chỉ có thể xác nhận build GitHub thành công sau khi push lên repository và thấy các job thực tế hoàn tất. Xem `VERIFICATION.md` để biết các kiểm thử đã chạy cục bộ.
