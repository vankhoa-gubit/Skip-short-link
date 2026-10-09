# AdSkip 0.2.0

Userscript và extension Manifest V3 để tìm trang đích từ các dạng **1shortlink → EZ4Short** đã khảo sát.

## Đã triển khai trong 0.2

- **Dán link trong popup:** tìm trang đích ngay cả khi đang mở tab khác; khôi phục link và kết quả khi mở lại popup.
- **Tiếp tục kiểm tra:** sau khi hoàn tất thao tác trên trang, đọc lại DOM và phiên hiện tại để tìm đích.
- **Xử lý phiên bị ngắt:** Dừng loại bỏ kết quả đang chạy; phiên bị ngắt khi service worker khởi động lại chuyển sang trạng thái có thể Tìm lại.
- **Hỗ trợ full-pages:** đọc URL đích từ dạng `/api/v1/full-pages?api_key=…&url=…&type=2` của 1shortlink, giải mã lớp Base64 cục bộ.
- Phân biệt link hết hạn, phiên hết hạn, giới hạn request và dịch vụ tạm ngừng.

Link người dùng cung cấp ngày 09/10/2026 đã cho đích **[Gofile](https://gofile.io/d/PKvjP6Yd)** qua extension, Tampermonkey trên trang thật và ô dán trong popup. Đây là xác nhận URL đích; chưa xác nhận khả năng tải file.

## Dùng ngay

Tải `dist/AdSkip-0.2.0.zip`, giải nén và làm theo [hướng dẫn cài đặt](HUONG_DAN_CAI_DAT.md):

- **Extension Chrome/Edge:** Load unpacked thư mục `extension` có `manifest.json`.
- **Tampermonkey:** tạo hoặc cập nhật script bằng toàn bộ nội dung `dist/adskip.user.js`, rồi Ctrl+S.

Mở popup, dán link và chọn **Tìm trang đích**, hoặc chọn **Phân tích tab này**. Widget cũng tự xử lý khi mở trang được hỗ trợ. Nếu cần thao tác trên trang, hoàn tất bước đó rồi chọn **Tiếp tục kiểm tra**. Với link đã dán, chọn **Mở bước hiện tại** trước để tiện ích đọc đúng tab.

**Mở trang đích**, **Sao chép**, **Dừng**, **Tìm lại**, **Thu gọn** và danh sách bước được cung cấp khi phù hợp. Tự mở mặc định tắt; tùy chọn này áp dụng cho luồng phân tích tab. Link đã dán được mở bằng nút rõ ràng trong popup.

## Phạm vi hiện tại

| Dạng link | Xử lý |
| --- | --- |
| 1shortlink `/api/v1/full-pages` dạng đã khảo sát | Giải mã URL đích cục bộ, giữ query/fragment; không cần request của resolver |
| 1shortlink `/link-encrypted/...` có `getLink(...)` hoặc `data-href` | Đọc dữ liệu trang hoặc gọi endpoint bình thường với cookie/CSRF mới, theo redirect |
| EZ4Short `/st?...&url=...`, lớp bọc mã hóa 1–2 lần | Đọc URL đích, giữ query/chữ ký; fragment trực tiếp đã kiểm thử |
| Bí danh EZ4Short không có `url`, Tech8s mở riêng | Hướng dẫn thao tác thủ công hoặc quay lại link gốc |
| CAPTCHA, mật khẩu, chặn truy cập | Dừng để người dùng hoàn tất bước trên trang rồi kiểm tra lại |

Vexfile, Gofile và các domain chia sẻ Yandex được nhận diện làm trang đích. Bản 0.2 đã kiểm tra chuỗi thật đến Gofile. Không có bộ lọc quảng cáo tổng quát. Khi URL đi qua HTTP redirect, fragment phụ thuộc transport của trình duyệt; xem [giới hạn kiểm thử](docs/KIEM_THU.md).

URL đầy đủ được giữ cục bộ để mở/sao chép và Tìm lại đúng link, kể cả query có API key. Extension lưu link trong `storage.session`; tùy chọn tự mở trong `storage.local`. Kết quả quá một giờ bị loại khi đọc lại. Trace che query và payload; AdSkip không có backend hay telemetry.

## Dựng và kiểm thử

Node.js 20 trở lên. Build và unit test không cần cài dependency:

```powershell
Set-Location 'D:\adskip'
npm run build
npm test
```

Kiểm thử trình duyệt dùng dependency đã khóa phiên bản:

```powershell
npm ci
npx playwright install chromium
npm run test:browser
npm run test:extension
npm run test:extension:v02
npm run test:worker
```

`test:browser` dùng GM shim. Các suite extension nạp tiện ích thật và dùng `chrome.*` thật. `test:extension:v02` dùng server HTTPS cục bộ, cần OpenSSL (hoặc `ADSKIP_OPENSSL_PATH`); ánh xạ hostname và bỏ kiểm tra chứng chỉ chỉ trong profile QA.

Để kiểm tra **Tampermonkey thật**, cung cấp thư mục gói Tampermonkey chính thức đã giải nén bằng `ADSKIP_TAMPERMONKEY_PATH`, rồi chạy `npm run test:tampermonkey`. Suite cài bundle bằng editor và cấp quyền userscript trong profile riêng. Gói Tampermonkey không nằm trong ZIP AdSkip.

Các lệnh sau dùng link do bạn cung cấp:

```powershell
$env:ADSKIP_LIVE_URL = 'https://1shortlink.com/link-encrypted/your-link'
npm run test:live
npm run test:live-extension
npm run test:live:tampermonkey
```

Với full-pages, `test:live` giải mã cục bộ và ghi rõ 0 request. `test:live-extension` thăm trang thật và kiểm tra thêm ô dán. `test:live:tampermonkey` cần gói manager đã giải nén, cài bundle qua editor trong profile mới cho mỗi lượt. Harness chặn quảng cáo/media bên thứ ba; cấu hình này không thuộc tính năng phát hành.

Có thể dùng Chromium/Playwright có sẵn qua `ADSKIP_BROWSER_PATH` và `ADSKIP_PLAYWRIGHT_PATH`. Bằng chứng thô và profile nằm trong `work/`, được bỏ khỏi ZIP.

## Mã nguồn và bằng chứng

- `src/`: logic chung, resolver, transport và widget.
- `extension/`: thư mục nạp trực tiếp; module chung được build từ `src/`.
- `dist/adskip.user.js`: userscript hoàn chỉnh.
- `tests/`: unit, runtime fixture, vòng đời worker và trang thật.
- [Kiến trúc](docs/KIEN_TRUC.md), [báo cáo kiểm thử 0.2](docs/KIEM_THU.md), ảnh và JSON đã che dữ liệu trong `docs/`.

Sau khi sửa module chung, build lại, Reload extension và tải lại tab; Tampermonkey cần lưu bundle mới. CodeGraph nằm ở `.codegraph/`; index, dependency và dữ liệu QA không thuộc gói phát hành.

Đóng gói lại trên Windows sau khi build: `.\scripts\package.ps1`. Script dùng danh sách tệp/thư mục cho phép và giữ đúng cấu trúc cài đặt trong ZIP.
