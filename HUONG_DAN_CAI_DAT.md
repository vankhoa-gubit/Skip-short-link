# Cài AdSkip 0.3.0

Chọn một bản cho mỗi trình duyệt để tránh widget và tùy chọn trùng nhau. Extension và Tampermonkey 5.4.1 đã được kiểm tra trong Chromium với profile riêng. Chrome/Edge cá nhân chưa được chạy trong lần kiểm thử này.

## A. Extension Chrome hoặc Edge

1. Giải nén `dist/AdSkip-0.3.0.zip` vào thư mục muốn giữ lâu dài. Nếu dùng mã nguồn hiện tại, thư mục tiện ích là `D:\adskip\extension`.
2. Mở `chrome://extensions` hoặc `edge://extensions`.
3. Bật **Developer mode / Chế độ nhà phát triển**.
4. Chọn **Load unpacked / Tải tiện ích đã giải nén**, chọn thư mục `extension` có `manifest.json`.
5. Ghim AdSkip lên thanh công cụ nếu muốn dùng ô dán link. Tải lại các tab 1short/EZ4Short đã mở.

Quy trình theo hướng dẫn chính thức của [Chrome](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load_an_unpacked_extension) và [Microsoft Edge](https://learn.microsoft.com/en-us/microsoft-edge/extensions/getting-started/extension-sideloading).

## B. Userscript trong Tampermonkey

1. Mở Tampermonkey; nếu chưa có, cài từ [trang chính thức](https://www.tampermonkey.net/).
2. Chọn **Create a new script / Tạo script mới**.
3. Mở `dist/adskip.user.js` trong gói bằng trình soạn thảo và sao chép toàn bộ nội dung.
4. Thay nội dung mặc định trong editor Tampermonkey, lưu bằng **Ctrl+S**, kiểm tra script **AdSkip: 1short & EZ4Short**, phiên bản **0.3.0**, đang bật.
5. Tải lại link gốc. Nếu Tampermonkey yêu cầu quyền chạy script, mở trang quản lý extension, bật **Allow User Scripts** trong chi tiết Tampermonkey; xem [FAQ A209](https://www.tampermonkey.net/faq.php?locale=en#Q209) cho phiên bản trình duyệt của bạn.

Ô dán link thuộc bản extension. Bản userscript chạy khi mở các trang được hỗ trợ.

## Sử dụng

### Dán link bằng popup

1. Bấm biểu tượng AdSkip, dán URL HTTPS của 1shortlink hoặc EZ4Short.
2. Chọn **Tìm trang đích** hoặc Enter.
3. Khi có kết quả, chọn **Mở trang đích** hoặc **Sao chép**.

Có thể đóng popup lúc đang xử lý rồi mở lại để xem kết quả. Link đã dán không tự chuyển tab đang đọc. **Phân tích tab này** chuyển nguồn kết quả sang tab hiện tại.

### Khi cần thao tác trên trang

- Với popup đang xử lý link đã dán: chọn **Mở bước hiện tại**, hoàn tất thao tác trong tab vừa mở, rồi quay lại popup chọn **Tiếp tục kiểm tra**.
- Với widget hoặc phân tích tab: hoàn tất thao tác trên trang đang mở rồi chọn **Tiếp tục kiểm tra**.
- Nếu phiên hết hạn, tải lại trang trước để có phiên mới. Tiện ích đọc lại dữ liệu trang khi tiếp tục.

### Các thao tác khác

- **Dừng** hủy bộ xử lý; **Tìm lại** chạy lại với dữ liệu mới.
- **Thu gọn** giảm diện tích widget; **Các bước đã xử lý** cho biết luồng dừng ở đâu.
- Tự mở mặc định tắt. Khi bật, chỉ luồng phân tích tab chuyển tới dịch vụ đích được nhận diện; popup link đã dán vẫn dùng nút mở.

### Quảng cáo và link EZ4Short dạng ngắn

- **Extension:** trong popup, mục **Chặn quảng cáo theo dịch vụ** có ba tùy chọn riêng. Widget chỉ đổi tùy chọn của dịch vụ đang mở. Bộ lọc mặc định bật, chỉ chặn domain quảng cáo đã nhận diện và ẩn khung tương ứng. Sau khi tắt, tải lại trang nếu cần nạp nội dung đã bị chặn.
- **Tampermonkey:** tùy chọn **Ẩn khung quảng cáo trên…** chỉ ẩn khung/ảnh đã nhận diện; kết nối mạng vẫn có thể xảy ra. Khi tắt, các phần tử được khôi phục. Tùy chọn được lưu và đồng bộ giữa các tab cùng dịch vụ.
- Link EZ4Short dạng mã ngắn được đọc khi trang đã cung cấp HTTP redirect hoặc URL trên nút lấy link sẵn sàng. Nếu nút chưa sẵn sàng hoặc cần xác minh, thao tác trên trang rồi **Tiếp tục kiểm tra**.

## Khi không thấy kết quả

| Hiện tượng | Cách xử lý |
| --- | --- |
| Không thấy widget | Kiểm tra tiện ích/script đang bật và được phép chạy trên domain; tải lại tab sau khi cài hoặc cập nhật |
| Tampermonkey gạch tên script hoặc cảnh báo nguồn gốc | Mở AdSkip trong editor, đối chiếu với bundle đã cài rồi Ctrl+S theo hướng dẫn của Tampermonkey; tải lại tab |
| Nhập URL bị báo lỗi | Dùng URL HTTPS đầy đủ của domain hỗ trợ; bỏ khoảng trắng thừa; URL có tài khoản/mật khẩu bị từ chối |
| “Cần thao tác trên trang” | Hoàn tất bước yêu cầu trên trang rồi Tiếp tục kiểm tra |
| Tech8s mở riêng | Mở link 1short/EZ4Short gốc để có ngữ cảnh |
| Alias EZ4Short thiếu đích hoặc nút chưa sẵn sàng | Hoàn tất bước trên trang rồi Tiếp tục kiểm tra; chưa có mẫu alias thật trong lần kiểm thử này |
| Phiên hết hạn | Tải lại trang, hoàn tất bước cần thiết rồi Tiếp tục kiểm tra |
| Link hết hạn, dịch vụ ngừng, quá nhiều request | Chọn Tìm lại khi link/dịch vụ khả dụng; lỗi được hiển thị riêng |
| “Phiên xử lý bị ngắt” | Chọn Tìm lại để bắt đầu phiên mới |
| Đã có URL nhưng file host báo lỗi | Kiểm tra trạng thái file trên trang đích; lấy URL chưa xác nhận file tải được |

## Cập nhật từ 0.1/0.2 và gỡ

- **Extension:** dùng thư mục `extension` mới; bấm **Reload** trên thẻ AdSkip trong trang quản lý extension, tải lại tab và kiểm tra popup ghi **0.3.0**. Nếu trình duyệt yêu cầu quyền chặn nội dung mới, bật lại tiện ích theo giao diện quản lý.
- **Tampermonkey:** mở script AdSkip hiện có, thay nội dung bằng bundle mới, **Ctrl+S** và tải lại tab. Tránh tạo hai bản AdSkip cùng bật.
- Nếu sửa mã nguồn: chạy `npm run build` trước khi cập nhật.
- Gỡ extension bằng **Remove**; gỡ userscript trong dashboard Tampermonkey.

Link nhập và kết quả đầy đủ, kể cả query có API key, được giữ cục bộ trong phiên để Tìm lại. Tùy chọn tự mở và quảng cáo được lưu riêng. Bằng chứng phát hành đã che query/payload. Gói này là bản cài cục bộ, chưa phát hành trên Chrome Web Store hay Edge Add-ons.
