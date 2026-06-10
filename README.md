# Odoo Mobile Wrapper

Ứng dụng di động bọc Odoo sử dụng **Capacitor 5** — hỗ trợ Android & iOS.

## Tính năng

- 🔐 Màn hình đăng nhập native (Odoo JSON-RPC)
- 🌐 WebView load giao diện Odoo
- 🔔 Push Notifications (Firebase FCM / APNs)
- 📶 Offline support với Service Worker
- 💾 Lưu thông tin đăng nhập giữa các phiên

---

## Yêu cầu

| Tool | Version |
|------|---------|
| Node.js | ≥ 18 |
| npm | ≥ 9 |
| Android Studio | Flamingo+ (cho Android) |
| Xcode | 14+ (cho iOS, chỉ trên macOS) |
| JDK | 17 (cho Android) |

---

## Cài đặt

```bash
# 1. Clone / giải nén project
cd odoo-mobile-wrapper

# 2. Cài dependencies
npm install

# 3. Thêm platform
npx cap add android    # cho Android
npx cap add ios        # cho iOS (chỉ trên macOS)

# 4. Sync
npx cap sync
```

---

## Cấu hình

### 1. Đổi App ID và tên

Sửa `capacitor.config.json`:

```json
{
  "appId": "com.congty.odoowrapper",   ← đổi thành bundle ID của bạn
  "appName": "Tên App Của Bạn"
}
```

### 2. Push Notifications (Firebase)

**Android:**
1. Vào [Firebase Console](https://console.firebase.google.com) → tạo project → thêm app Android
2. Tải file `google-services.json` → đặt vào `android/app/`
3. Sửa `android/app/build.gradle`:
   ```groovy
   apply plugin: 'com.google.gms.google-services'
   ```

**iOS:**
1. Thêm app iOS vào Firebase project
2. Tải `GoogleService-Info.plist` → thêm vào Xcode project
3. Bật Push Notifications capability trong Xcode

### 3. Odoo: Cài module Push

Đảm bảo Odoo server có module `mail` (chuẩn). Để nhận push, Odoo 16+ có sẵn
endpoint `mail.push.device`. Với Odoo cũ hơn, bạn cần custom module.

---

## Build & Run

### Android

```bash
# Debug (chạy trên emulator/device)
npx cap open android
# → nhấn Run trong Android Studio

# Release APK
cd android
./gradlew assembleRelease
# APK ở: android/app/build/outputs/apk/release/
```

### iOS

```bash
npx cap open ios
# → chọn device → nhấn Run trong Xcode
```

---

## Cấu trúc project

```
odoo-mobile-wrapper/
├── capacitor.config.json     # Cấu hình Capacitor
├── package.json
├── www/                      # Web app (nguồn)
│   ├── index.html            # Login + WebView UI
│   ├── manifest.json         # PWA manifest
│   ├── service-worker.js     # Offline cache
│   ├── css/
│   │   └── style.css         # Toàn bộ styles
│   └── js/
│       ├── app.js            # Logic chính
│       ├── auth.js           # Odoo authentication
│       └── push.js           # Push notifications
├── android/                  # (tự tạo sau npx cap add android)
└── ios/                      # (tự tạo sau npx cap add ios)
```

---

## Tùy chỉnh thường gặp

### Đổi màu theme

Sửa biến CSS trong `www/css/style.css`:
```css
:root {
  --odoo-purple: #714B67;   ← màu chính
  --odoo-green: #00A09D;    ← màu phụ
}
```

### Tắt auto-detect database

Trong `www/js/app.js`, bỏ hoặc comment hàm `tryFetchDatabases()`.

### Hardcode server URL

Trong `www/js/app.js`, sửa `loadSavedCredentials()` để set cứng:
```js
this.el.serverUrl.value = 'https://erp.congty.vn';
this.el.serverUrl.readOnly = true; // khoá không cho sửa
```

---

## Lưu ý bảo mật

- Không hardcode password trong code
- Dùng HTTPS cho Odoo server (bắt buộc với iOS)
- Với production, bật ProGuard/R8 để obfuscate code Android

---

## Troubleshooting

| Lỗi | Giải pháp |
|-----|-----------|
| `net::ERR_CLEARTEXT_NOT_PERMITTED` | Odoo server phải dùng HTTPS |
| Login thành công nhưng iframe trắng | Kiểm tra CORS headers trên Odoo server |
| Push không nhận được | Kiểm tra `google-services.json` đã đặt đúng chỗ chưa |
| App crash khi mở | Chạy `npx cap sync` lại sau khi sửa config |
