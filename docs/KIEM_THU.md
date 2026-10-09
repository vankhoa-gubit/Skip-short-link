# Báo cáo kiểm thử AdSkip 0.2.0

**Ngày:** 09/10/2026 (Asia/Bangkok). **Môi trường:** Windows, Node.js 24.21.0, Playwright 1.62.1, Chromium 151.0.7922.34, Tampermonkey 5.4.1. Kiểm thử trên working tree 0.2 dựa trên commit `838dffe`; chưa tạo commit mới. Mọi trình duyệt dùng profile QA riêng trong `work/`.

## Kết quả

| Hạng mục | Trạng thái | Bằng chứng và phạm vi |
| --- | --- | --- |
| Build và cú pháp | PASS | `npm run build`; kiểm tra JavaScript và tạo bundle/module chung |
| Unit và contract | PASS, 43/43 | Core 14, resolver 12, background 13, transport 4; background dùng API stub trong Node |
| Userscript với GM shim | PASS, 7 kiểm tra | Bundle thật, fixture network, hợp đồng GM mô phỏng; `userscript-result.json` |
| Extension với fixture | PASS, 7 kiểm tra | Tiện ích unpacked và `chrome.*` thật; `extension-result.json` |
| Popup và tiếp tục 0.2 | PASS, 10 kiểm tra | Tiện ích thật, server HTTPS fixture; `extension-v02-result.json` |
| Worker khởi động lại | PASS, 3 kiểm tra | Đóng worker thật bằng CDP, xác nhận global JS mới, phục hồi trạng thái resolving được gieo trước thành stopped rồi Tìm lại; `worker-lifecycle-result.json` |
| Tampermonkey cài thật, fixture | PASS, 5 kiểm tra | Gói chính thức unpacked, quyền userscript thật, cài bundle bằng editor, GM API thật; `tampermonkey-result.json` |
| Full-pages người dùng cung cấp | PASS, 0 request của resolver | Giải mã cục bộ đúng Gofile; `live-result.json`. Đây không phải bằng chứng HTTP |
| Thăm dò HTTP full-pages | PASS | Trang thật trả 302 tới link-encrypted; `live-full-pages-probe.json` |
| Extension trên trang thật và ô dán | PASS, 2 kiểm tra | Cùng đích Gofile; 13 request bên thứ ba bị harness chặn, 0 lỗi JavaScript trang; `live-extension-result.json` |
| Tampermonkey trên trang thật | PASS, 3 kiểm tra | Cài bundle trong profile mới cho lượt này; đích Gofile, 20 request bên thứ ba bị chặn, 0 lỗi JavaScript trang; `live-tampermonkey-result.json` |
| Giao diện | PASS trong kích thước đã xem | Desktop 1440×900, widget 390×844, popup 360px và 320px; đã xem ảnh, kiểm tra giới hạn ngang và focus |
| Chrome/Edge cá nhân, Firefox/Violentmonkey | NOT RUN | Các lượt thực tế dùng Chromium QA; không cài vào profile cá nhân |
| Điện thoại thật/tablet | NOT RUN | Mobile là viewport desktop, không phải thiết bị thật |
| File Gofile còn tồn tại/tải được | NOT RUN | Dừng ở địa chỉ đích; không tải hoặc cài tài nguyên |
| CAPTCHA/mật khẩu trên trang thật | NOT RUN | Test tiếp tục dùng thao tác fixture sinh data-href mới; không chứng minh mọi kiểu xác minh thật |

## Luồng trang thật

URL full-pages người dùng gửi được xử lý theo hai cách:

```text
Dán vào popup → giải mã Base64 cục bộ → Gofile

Mở URL trong trình duyệt
    → 1short full-pages trả 302
    → link-encrypted và dữ liệu trang
    → redirect-link qua transport
    → EZ4Short /st
    → Gofile
```

Đích nhất quán:

```text
https://gofile.io/d/PKvjP6Yd
```

Extension và Tampermonkey giữ trang 1short sau khi có kết quả vì tự mở tắt. Không bấm tải file. Phản hồi của các dịch vụ hỗ trợ là thật; quảng cáo/media bên thứ ba bị chặn bởi harness. Cơ chế chặn này không được phát hành trong AdSkip.

## Các luồng 0.2 đã kiểm tra

- Dán URL từ tab không liên quan, giữ nguyên query có chữ ký và fragment; không điều hướng tab đó.
- URL không hợp lệ có thông báo inline và `aria-invalid`, giữ kết quả trước đó.
- Dán 1short, đóng/mở popup khôi phục kết quả và input; đóng popup khi request đang chờ vẫn hoàn tất job riêng.
- Link hết hạn có thông báo và Tìm lại; không hiển thị tiếp tục cho lỗi không thể phục hồi bằng thao tác trên trang.
- Popup mở bước thủ công trong tab được gắn với job; người dùng thao tác; Tiếp tục kiểm tra đọc DOM mới từ đúng tab.
- Widget extension và userscript tiếp tục sau khi fixture tạo data-href mới.
- Chuyển từ kết quả link đã dán sang phân tích tab dùng dữ liệu tab hiện tại.
- Dừng, Tìm lại, trạng thái riêng từng tab, tự mở theo tùy chọn, đọc `/st` sớm, loop/hop limit, timeout/abort và body limit.
- Tampermonkey thật gửi POST chứa CSRF mới và cookie phiên fixture, theo redirect và giữ query đích; full-pages giữ fragment mà không có request GM.

Fixture HTTPS dùng chứng chỉ QA và ánh xạ hostname trong tham số Chromium; không sửa DNS/chứng chỉ hệ thống. Tampermonkey 5.4.1 lấy từ [gói stable chính thức](https://www.tampermonkey.net/crx/tampermonkey_stable.crx), SHA256 `a124e3189ecc0981ce79ef182dd3897a75fe22fc7bf0828e9d293ad7122d3d4d`. Chỉ bổ sung public key của gói vào manifest cục bộ để giữ ID; JavaScript nhà cung cấp không thay đổi. Gói Tampermonkey không được đóng cùng AdSkip.

## Phát hiện và giới hạn

1. **Nạp tab mới trong harness:** Playwright interception có thể gắn sau request đầu tiên của `chrome.tabs.create`. Suite popup 0.2 đã chuyển sang server HTTPS fixture để kiểm tra tab mở thật nhất quán.
2. **Profile Tampermonkey dùng lại:** sau khi mở lại gói unpacked/profile QA, manager cảnh báo không xác định được nguồn gốc script và không chạy. Lượt live cuối cài bundle bằng editor trong profile mới ngay trước kiểm thử và đã PASS. Không thay đổi kiểm tra bảo vệ của manager. Chưa chứng minh khôi phục script trong profile QA bị cảnh báo qua nhiều lần khởi động; hướng dẫn cài có cách xử lý cảnh báo theo UI.
3. **Fragment qua HTTP:** quan sát thấy `fetch().url` bỏ fragment trong một chuỗi redirect fixture. URL trực tiếp `/st` và full-pages giữ fragment; không cam kết mọi fragment qua redirect HTTP/GM đều được giữ.
4. **Worker restart:** trạng thái gián đoạn được gieo trước khi đóng worker thật. Không chứng minh việc đóng đúng lúc một request thật còn đang chạy hoặc mọi điều kiện treo worker.
5. **Popup:** bài test mở `popup.html` như trang của extension để điều khiển và chụp ảnh. Chưa thử thao tác bấm biểu tượng toolbar trong Chrome/Edge cá nhân hay kích thước cửa sổ popup native.
6. **Phiên và dữ liệu:** input/kết quả đầy đủ ở bộ nhớ phiên cục bộ có thể chứa API key hoặc query có chữ ký. Trace/JSON phát hành đã che query và payload; kết quả quá một giờ bị loại khi đọc, không có timer xóa nền.
7. **Dịch vụ và file host:** một mẫu thật chỉ chứng minh định dạng/luồng đã thử ngày này. Gofile đã kiểm tra chuỗi tới URL, Yandex chỉ nhận diện domain, bí danh EZ4Short thiếu `url` và Tech8s riêng còn hướng dẫn thủ công.

## Bằng chứng phát hành

JSON trong `docs/evidence/`: `unit-result.json`, `userscript-result.json`, `extension-result.json`, `extension-v02-result.json`, `worker-lifecycle-result.json`, `tampermonkey-result.json`, `live-result.json`, `live-full-pages-probe.json`, `live-extension-result.json`, `live-tampermonkey-result.json`.

Ảnh trong `docs/screenshots/`: widget desktop/mobile, popup 0.2 resolved/invalid/manual/320px, widget manual, Tampermonkey desktop/mobile và hai ảnh trang thật.

ZIP được tạo bằng `scripts/package.ps1` với danh sách thư mục/tệp cho phép. Không đóng `work/`, input thật, TLS key, profile, gói Tampermonkey, browser, `node_modules/`, `.git/` hay `.codegraph/`. Kiểm tra archive xác nhận manifest/bundle 0.2, module cần thiết và không có API key thật trong tệp văn bản.

Chạy lại theo README. Các test live gửi request tới URL bạn cung cấp; dịch vụ có thể thay đổi DOM, endpoint hoặc redirect sau ngày kiểm thử.
