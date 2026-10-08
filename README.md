# AdSkip 0.1.0

Userscript và extension Manifest V3 để lấy trang đích từ các dạng **1shortlink → EZ4Short** đã khảo sát. Mã nguồn được triển khai tại `D:\adskip`.

Với URL 1short người dùng cung cấp, cả luồng HTTP và extension chạy trên trang thật đã tìm được:

```text
https://vexfile.com/download/2fezKvg9vP
```

Kết quả này xác nhận việc lấy địa chỉ đích. Khả năng tải tài nguyên tại Vexfile chưa được xác nhận.

## Dùng ngay

Cài một trong hai bản theo [hướng dẫn cài đặt](HUONG_DAN_CAI_DAT.md):

- **Extension Chrome/Edge:** nạp thư mục `D:\adskip\extension` bằng **Load unpacked**.
- **Userscript:** tạo script trong Tampermonkey rồi dán toàn bộ `D:\adskip\dist\adskip.user.js`.

Mở link gốc. Bảng AdSkip xuất hiện ở góc dưới bên phải; chọn **Mở trang đích** hoặc **Sao chép**. Tùy chọn **Mở trang đích khi tìm được** mặc định tắt. **Dừng**, **Tìm lại**, **Thu gọn** và danh sách các bước có sẵn trong bảng.

## Phạm vi hiện tại

| Dạng link | Xử lý |
| --- | --- |
| `1shortlink.com/link-encrypted/...` có lời gọi `getLink(...)` như mẫu khảo sát | Đọc `data-href` sẵn có hoặc gọi endpoint bình thường với cookie và CSRF mới; theo redirect |
| `ez4short.com/st?...&url=...` | Lấy URL đích trực tiếp, giữ query và chữ ký của URL |
| URL `/st` với `url` mã hóa một hoặc hai lần | Đã kiểm tra bằng fixture |
| Bí danh ngắn của EZ4Short không có `url` | Hiển thị cần thao tác trên trang |
| Bài Tech8s được mở riêng | Hiển thị cần quay lại link gốc; không đủ dữ liệu để suy ra file |
| CAPTCHA, mật khẩu, trang chặn truy cập, dịch vụ khác | Hiển thị trạng thái thủ công hoặc lỗi cụ thể |

Vexfile, Gofile và các domain chia sẻ Yandex được nhận diện làm trang đích. Chỉ luồng tới Vexfile được kiểm chứng với mẫu thật trong lần triển khai này. Tool không tự tải hoặc cài tài nguyên. Bản này cũng không có bộ lọc quảng cáo tổng quát.

## Dựng lại và kiểm thử

Node.js 20 trở lên. Dựng bundle và chạy unit test không cần cài dependency:

```powershell
Set-Location 'D:\adskip'
npm run build
npm test
```

Để chạy kiểm thử trình duyệt từ package đã khóa phiên bản:

```powershell
npm ci
npx playwright install chromium
npm run test:browser
npm run test:extension
```

Hai kiểm thử trên dùng trang fixture. Userscript dùng GM API shim; extension được nạp thật với các API `chrome.*`. Các lệnh sau gửi request tới URL thật do bạn chỉ định:

```powershell
$env:ADSKIP_LIVE_URL = 'https://1shortlink.com/link-encrypted/your-link'
npm run test:live
npm run test:live-extension
```

`test:live-extension` dùng profile riêng và chặn quảng cáo/media bên thứ ba trong môi trường kiểm thử. Cơ chế chặn này không được đóng gói vào extension.

Có thể dùng Playwright/Chromium đã cài sẵn bằng `ADSKIP_PLAYWRIGHT_PATH` và `ADSKIP_BROWSER_PATH`. Bằng chứng và profile kiểm thử được ghi vào `work/` và không nằm trong gói phát hành.

## Mã nguồn và bằng chứng

- `src/`: logic dùng chung, resolver, transport và widget.
- `extension/`: bản nạp trực tiếp vào Chrome/Edge; các module chung được build từ `src/`.
- `dist/adskip.user.js`: userscript hoàn chỉnh.
- `tests/`: unit, fixture browser và kiểm thử trang thật.
- [Kiến trúc](docs/KIEN_TRUC.md), [báo cáo kiểm thử](docs/KIEM_THU.md).

CodeGraph đã được khởi tạo ở `D:\adskip\.codegraph`. `work/`, `.codegraph/` và `node_modules/` được bỏ khỏi gói phát hành. Khi sửa module chung, chạy lại build rồi reload extension và tab đang mở.
