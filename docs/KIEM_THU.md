# Báo cáo kiểm thử AdSkip 0.1.0

**Ngày:** 08/10/2026 (Asia/Bangkok). **Môi trường:** Windows, Node.js 24.21.0, Playwright 1.62.1, Chromium 151.0.7922.34. Trình duyệt dùng profile riêng trong `D:\adskip\work`; chưa cài vào Chrome/Edge cá nhân.

## Kết quả

| Hạng mục | Trạng thái | Bằng chứng và giới hạn |
| --- | --- | --- |
| Build và kiểm tra cú pháp | PASS | `npm run build`; userscript và module extension được tạo |
| Core/resolver | PASS, 20/20 | URL có query/chữ ký/fragment, mã hóa 1–2 lần, hostname, POST endpoint, loop, hop limit, CAPTCHA, abort và alias không hỗ trợ |
| Userscript trong Chromium | PASS, 6 kiểm tra | Bundle thật; GM API được mô phỏng, network dùng fixture. Chưa chứng minh Tampermonkey cài thật |
| Extension trong Chromium | PASS, 7 kiểm tra | Extension unpacked, API `chrome.*` thật, network fixture |
| Link 1short thật qua HTTP | PASS | Phiên mới qua Playwright APIRequestContext; 3 request của resolver; trả đúng Vexfile |
| Link 1short thật qua extension | PASS | Extension unpacked, phản hồi 1short/EZ4Short thật; quảng cáo/media bên thứ ba bị chặn trong test; 0 lỗi JavaScript trang |
| Giao diện desktop, mobile, popup | PASS trong kích thước đã xem | 1440×900, widget 390×844, popup 360px; kiểm tra ảnh thủ công. Không phải test điện thoại thật |
| CodeGraph | PASS | `codegraph init -i` hoàn tất; MCP status xác nhận index hoạt động; bỏ qua scratch/browser profiles |
| Tampermonkey/Violentmonkey cài thật | NOT RUN | Chỉ kiểm chứng hợp đồng GM bằng shim |
| Chrome và Edge cá nhân | NOT RUN | Quy trình cài đã được hướng dẫn; chạy thực tế dùng Chromium riêng |
| File có tải được/cài được | NOT RUN | Không tải hoặc cài tài nguyên; lần thăm dò HTTP trước đó của Vexfile mẫu trả 500 |
| Gofile/Yandex trên link thật | NOT RUN | Chỉ kiểm thử nhận diện domain; chưa có chuỗi URL mẫu thật |
| EZ4Short alias không có `url`, Tech8s riêng | MANUAL | Tool hiển thị cần thao tác, không đoán link đích |
| CAPTCHA/mật khẩu/bước bảo vệ server | MANUAL | Không triển khai giải các bước này |

## Luồng trang thật

Mẫu 1short người dùng gửi được xử lý theo chuỗi:

```text
1short link-encrypted → redirect-link → EZ4Short /st → Vexfile
```

Địa chỉ tìm được qua cả hai phương thức:

```text
https://vexfile.com/download/2fezKvg9vP
```

HTTP test tự lấy token/phiên mới, không dùng lại token từ ảnh chụp cũ. Extension test lấy `data-href` của trang rồi service worker xử lý redirect. Test để `autoOpen` tắt; tab vẫn ở 1short sau khi có kết quả. Có 13 request quảng cáo/media bên thứ ba bị chặn trong test; đây là cấu hình harness và không phải tính năng chặn quảng cáo của bản phát hành.

Các trace đính kèm che ciphertext, CSRF và publisher query. URL mẫu dài và profile không nằm trong ZIP phát hành. Kết quả lấy địa chỉ không xác nhận file còn khả dụng.

## Các thao tác đã kiểm tra

**Userscript:** khởi tạo từ DOM; hợp đồng GM POST/redirect; giữ URL đầy đủ khi sao chép; thu gọn/mở lại; widget vừa 390×844; đọc `/st` từ document-start; trả hướng dẫn thủ công khi mở Tech8s riêng.

**Extension:** content script → service worker → redirect; trạng thái riêng cho hai tab; đọc `/st` sớm; popup lấy đúng tab đang mở; Dừng; Tìm lại sau Dừng; bật tự mở bằng thao tác người dùng và chuyển tới file host được nhận diện. Trong test fixture, trang đích cũng là fixture.

Đã sửa hai lỗi phát hiện qua kiểm thử: trang `/st` bị dừng trước khi có DOM khiến widget không gắn được; popup mở trong tab kiểm thử bị lấy trạng thái của chính tab popup. Sau sửa, cả hai suite đều qua.

## Bằng chứng trong gói ZIP

- `docs/evidence/userscript-result.json`
- `docs/evidence/extension-result.json`
- `docs/evidence/live-result.json`
- `docs/evidence/live-extension-result.json`
- `docs/screenshots/userscript-desktop.png`, `userscript-mobile.png`
- `docs/screenshots/extension-desktop.png`, `extension-popup.png`, `live-extension.png`

Có thể chạy lại theo các lệnh trong README. Test fixture không cần link thật. Test live cần `ADSKIP_LIVE_URL` của bạn và gửi request ra mạng. Các dịch vụ có thể thay đổi DOM, endpoint hoặc dạng redirect; lúc đó adapter cần cập nhật.
