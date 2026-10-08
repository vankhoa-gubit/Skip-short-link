# Cài AdSkip 0.1.0

Chọn một bản cho mỗi trình duyệt để thao tác và tùy chọn không bị trùng. Với bản hiện tại, **extension đã được thử trên link thật**; userscript đã được thử qua GM API shim, chưa thử trong Tampermonkey cài thật.

## A. Extension Chrome hoặc Edge

1. Mở `chrome://extensions` trên Chrome hoặc `edge://extensions` trên Edge.
2. Bật **Developer mode / Chế độ nhà phát triển**.
3. Chọn **Load unpacked / Tải tiện ích đã giải nén**.
4. Chọn **`D:\adskip\extension`**, thư mục có `manifest.json`. Nếu dùng file ZIP, giải nén rồi chọn thư mục `extension` bên trong gói.
5. Mở lại hoặc tải lại tab có link 1short/EZ4Short. Có thể ghim AdSkip lên thanh công cụ để mở popup.

Đây là quy trình nạp bản cục bộ theo hướng dẫn chính thức của [Chrome](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load_an_unpacked_extension) và [Microsoft Edge](https://learn.microsoft.com/en-us/microsoft-edge/extensions/getting-started/extension-sideloading).

## B. Userscript trong Tampermonkey

1. Mở Tampermonkey có sẵn trong trình duyệt. Nếu chưa có, lấy từ [trang chính thức](https://www.tampermonkey.net/).
2. Chọn **Create a new script / Tạo script mới**.
3. Mở `D:\adskip\dist\adskip.user.js` bằng trình soạn thảo và sao chép toàn bộ nội dung.
4. Thay nội dung mặc định trong editor của Tampermonkey, lưu bằng **Ctrl+S** rồi bật script.
5. Tải lại link gốc. Nếu Tampermonkey báo chưa được phép chạy userscript, làm theo hướng dẫn **Allow User Scripts / Developer Mode** của [Tampermonkey FAQ A209](https://www.tampermonkey.net/faq.php?locale=en#Q209).

## Sử dụng

- Mở **link gốc 1short**, hoặc URL EZ4Short dạng `/st?...&url=...`.
- Khi thấy **Đã tìm được trang đích**, chọn **Mở trang đích** hoặc **Sao chép**.
- Bật **Mở trang đích khi tìm được** nếu muốn tự chuyển tab hiện tại. Tùy chọn này được lưu; có thể tắt lại trong widget hoặc popup.
- Chọn **Dừng** để dừng bộ xử lý; **Tìm lại** để chạy lại; **Thu gọn** để giảm phần giao diện che trang.
- Mở **Các bước đã xử lý** để xem tool đã dừng ở đâu.

Link đích được nhận diện không có nghĩa file còn tồn tại hoặc tải được. Việc mở link đích không tự cài phần mềm.

## Khi không thấy kết quả

| Hiện tượng | Cách xử lý |
| --- | --- |
| Không thấy widget | Kiểm tra extension/script đang bật và được phép truy cập domain; tải lại tab sau khi cài |
| “Cần thao tác trên trang” ở Tech8s | Mở lại URL 1short ban đầu; bài viết riêng không mang đủ ngữ cảnh file |
| Alias EZ4Short không có `url` | Dạng này chưa có adapter; tiếp tục trên trang hoặc dùng link gốc |
| CSRF/session hết hạn hoặc request lỗi | Tải lại trang để có phiên mới rồi chọn Tìm lại |
| CAPTCHA/mật khẩu | Hoàn tất thao tác cần thiết trên trang; bản thử không giải các bước này |
| Đã tìm được link nhưng trang đích lỗi | Đây là kết quả lấy URL; kiểm tra trạng thái file tại dịch vụ lưu trữ |

## Cập nhật và gỡ

- Sau khi sửa code: chạy `npm run build`; bấm **Reload** trên thẻ AdSkip ở trang quản lý extension và tải lại tab. Userscript cần dán lại bundle mới vào Tampermonkey.
- Gỡ extension bằng **Remove** ở trang quản lý extension; gỡ userscript trong dashboard Tampermonkey.

Mã nguồn đầy đủ ở `D:\adskip`. Báo cáo và bằng chứng trong `docs/` của gói ZIP. Chưa có bản phát hành trên Chrome Web Store hay Edge Add-ons.
