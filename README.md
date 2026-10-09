# AdSkip 1.0.0

Userscript và extension Manifest V3 để tìm trang đích từ các dạng **1shortlink → EZ4Short** đã khảo sát.

## Mới trong 1.0

- **Quản lý nhiều link:** dán tối đa 50 dòng, bỏ link trùng, xử lý lần lượt, Dừng/Chạy tiếp và Tìm lại từng dòng. Hàng đợi không tự mở trang đích; HTTP 429 tạm dừng các link còn chờ.
- **Lịch sử trên máy:** tìm kiếm, lọc trạng thái, mở/sao chép đích, xóa từng kết quả hoặc xóa toàn bộ. Lịch sử lưu nhãn nguồn đã che query/payload và URL đích đầy đủ; không lưu link gốc đầy đủ.
- **Trang cài đặt:** giữ 25/100/250 kết quả, bật/tắt ghi lịch sử, khoảng chờ 0,5/1/2 giây và tự mở khi xử lý từng tab. Mặc định giữ 100 kết quả, chờ 1 giây và tắt tự mở.
- **Extension và Tampermonkey:** nút **Quản lý link** mở trang quản lý hoặc hộp thoại với ba mục **Nhiều link / Lịch sử / Cài đặt**. Hỗ trợ bàn phím và màn hình hẹp.
- **Phân phối:** [ZIP 1.0](dist/AdSkip-1.0.0.zip), [userscript](https://raw.githubusercontent.com/vankhoa-gubit/Skip-short-link/main/dist/adskip.user.js) có địa chỉ cập nhật, [changelog](CHANGELOG.md) và [báo cáo 1.0](docs/KIEM_THU_1.0.md).

## Chức năng từ 0.3

- **EZ4Short dạng mã ngắn:** theo HTTP redirect hoặc đọc URL trên nút lấy link đã sẵn sàng. Giữ query/chữ ký/fragment của URL trong nút; tiếp tục với DOM mới sau thao tác trên trang.
- **Lọc quảng cáo theo dịch vụ:** extension dùng quy tắc mạng riêng cho 1shortlink, EZ4Short và Tech8s; bật/tắt trong popup hoặc widget. Chỉ lọc các domain quảng cáo trong danh sách.
- **Userscript ẩn khung quảng cáo:** nhận diện iframe/ảnh quảng cáo và `ins.adsbygoogle`; bật/tắt để khôi phục, lưu và đồng bộ tùy chọn giữa các tab. Userscript không chặn kết nối mạng.
- **Adapter riêng từng dịch vụ:** thuận tiện bổ sung định dạng và fixture; resolver giữ giới hạn request, vòng lặp, Dừng và lỗi.

## Các chức năng từ 0.2

- **Dán link trong popup:** tìm trang đích ngay cả khi đang mở tab khác; khôi phục link và kết quả khi mở lại popup.
- **Tiếp tục kiểm tra:** sau khi hoàn tất thao tác trên trang, đọc lại DOM và phiên hiện tại để tìm đích.
- **Xử lý phiên bị ngắt:** Dừng loại bỏ kết quả đang chạy; phiên bị ngắt khi service worker khởi động lại chuyển sang trạng thái có thể Tìm lại.
- **Hỗ trợ full-pages:** đọc URL đích từ dạng `/api/v1/full-pages?api_key=…&url=…&type=2` của 1shortlink, giải mã lớp Base64 cục bộ.
- Phân biệt link hết hạn, phiên hết hạn, giới hạn request và dịch vụ tạm ngừng.

Link người dùng cung cấp ngày 09/10/2026 đã cho đích **[Gofile](https://gofile.io/d/PKvjP6Yd)** qua extension, Tampermonkey trên trang thật và ô dán trong popup. Trong lượt extension 0.3, quy tắc phát hành đã chặn script của `3nbf4.com` và `forfrogadiertor.com`, không dùng interception của test. Đây là xác nhận URL đích; chưa xác nhận khả năng tải file. EZ4Short dạng mã ngắn mới được kiểm chứng bằng fixture, chưa có mẫu alias thật.

## Dùng ngay

Tải [AdSkip-1.0.0.zip](dist/AdSkip-1.0.0.zip), giải nén và làm theo [hướng dẫn cài đặt](HUONG_DAN_CAI_DAT.md):

- **Extension Chrome/Edge:** Load unpacked thư mục `extension` có `manifest.json`.
- **Tampermonkey:** tạo hoặc cập nhật script bằng toàn bộ nội dung `dist/adskip.user.js`, rồi Ctrl+S.

Mở popup, dán link và chọn **Tìm trang đích**, hoặc chọn **Phân tích tab này**. Widget cũng tự xử lý khi mở trang được hỗ trợ. Nếu cần thao tác trên trang, hoàn tất bước đó rồi chọn **Tiếp tục kiểm tra**. Với link đã dán, chọn **Mở bước hiện tại** trước để tiện ích đọc đúng tab.

Để xử lý danh sách, chọn **Quản lý link** trong popup/widget. Mỗi dòng một URL; chọn **Bắt đầu xử lý**. Extension giữ hàng đợi khi đóng trang quản lý; nếu worker bị ngắt, chọn **Chạy tiếp**. Hàng đợi Tampermonkey thuộc tab đang mở: đóng hộp thoại vẫn giữ hàng đợi, đóng/tải lại tab kết thúc hàng đợi.

Với dòng cần thao tác: extension có **Mở bước → Tiếp tục** để đọc tab được mở rõ ràng. Tampermonkey dùng widget **Tiếp tục kiểm tra** trong tab vừa mở; quản lý của tab khác không đọc DOM tab này. **Tìm lại** trong hàng đợi đọc lại link gốc và phiên hiện có.

**Mở trang đích**, **Sao chép**, **Dừng**, **Tìm lại**, **Thu gọn** và danh sách bước được cung cấp khi phù hợp. Tự mở mặc định tắt; tùy chọn này áp dụng cho luồng phân tích tab. Link đã dán được mở bằng nút rõ ràng trong popup.

Bộ lọc quảng cáo mặc định bật cho cả ba dịch vụ. Đổi tùy chọn của từng dịch vụ trong popup, hoặc chỉ dịch vụ hiện tại trong widget. Với extension, tải lại trang để nạp lại nội dung đã bị chặn trước khi tắt bộ lọc. Tùy chọn quảng cáo độc lập với tự mở đích.

## Phạm vi hiện tại

| Dạng link | Xử lý |
| --- | --- |
| 1shortlink `/api/v1/full-pages` dạng đã khảo sát | Giải mã URL đích cục bộ, giữ query/fragment; không cần request của resolver |
| 1shortlink `/link-encrypted/...` có `getLink(...)` hoặc `data-href` | Đọc dữ liệu trang hoặc gọi endpoint bình thường với cookie/CSRF mới, theo redirect |
| EZ4Short `/st?...&url=...`, lớp bọc mã hóa 1–2 lần | Đọc URL đích, giữ query/chữ ký; fragment trực tiếp đã kiểm thử |
| EZ4Short `/alias` có HTTP redirect hoặc nút lấy link đã sẵn sàng | GET có giới hạn hoặc đọc DOM/HTML; nhận URL đích, tiếp tục sau thao tác khi cần |
| EZ4Short chưa cấp URL, nút chưa sẵn sàng; Tech8s mở riêng | Hướng dẫn thao tác thủ công hoặc quay lại link gốc |
| CAPTCHA, mật khẩu, chặn truy cập | Dừng để người dùng hoàn tất bước trên trang rồi kiểm tra lại |

Vexfile, Gofile và các domain chia sẻ Yandex được nhận diện làm trang đích. Bản 0.3 đã kiểm tra lại chuỗi thật đến Gofile. Bộ lọc chỉ hoạt động trên các dịch vụ hỗ trợ và danh sách domain trong [kiến trúc](docs/KIEN_TRUC.md); không bảo đảm chặn mọi quảng cáo. Khi URL đi qua HTTP redirect, fragment phụ thuộc transport của trình duyệt; xem [giới hạn kiểm thử](docs/KIEM_THU_0.3.md).

URL gốc đầy đủ cần để Tìm lại được giữ trong `storage.session` của extension hoặc bộ nhớ tab userscript, kể cả query có API key. Lịch sử lưu cục bộ trong `storage.local`/kho GM, chỉ có nhãn nguồn đã che dữ liệu và URL đích đầy đủ. URL đích có thể chứa chữ ký truy cập; file JSON xuất cũng giữ URL đó. Tắt lưu lịch sử chỉ ngừng ghi mới; xóa trong mục Lịch sử khi cần. Tùy chọn quảng cáo/tự mở từ 0.3 được giữ. Kết quả riêng trong popup/widget quá một giờ bị loại khi extension đọc lại; lịch sử dùng giới hạn số bản ghi. Trace che query/payload; AdSkip không có backend hay telemetry.

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
npm run test:extension:v03
npm run test:extension:v1
npm run test:worker
```

`test:browser` dùng GM shim. Các suite extension nạp tiện ích thật và dùng `chrome.*` thật. `test:extension:v02` và `test:extension:v03` dùng server HTTPS cục bộ, cần OpenSSL (hoặc `ADSKIP_OPENSSL_PATH`); ánh xạ hostname và bỏ kiểm tra chứng chỉ chỉ trong profile QA. Suite 0.3 kiểm tra request quảng cáo có thực sự tới server không, bật/tắt, phạm vi từng dịch vụ, giữ tài nguyên xác minh và khởi động lại trình duyệt; không dùng Playwright interception.

`test:extension:v1` kiểm tra options UI, clipboard/file xuất thật, batch/429/Dừng/Chạy tiếp, tiếp tục thủ công, worker restart và dữ liệu sau browser restart. Suite Tampermonkey kiểm tra thêm manager, GM history ghi đồng thời ở hai tab và dữ liệu sau tải lại. Chi tiết và giới hạn nằm trong báo cáo 1.0.

Để kiểm tra **Tampermonkey thật**, cung cấp thư mục gói Tampermonkey chính thức đã giải nén bằng `ADSKIP_TAMPERMONKEY_PATH`, rồi chạy `npm run test:tampermonkey`. Suite cài bundle bằng editor và cấp quyền userscript trong profile riêng. Gói Tampermonkey không nằm trong ZIP AdSkip.

Các lệnh sau dùng link do bạn cung cấp:

```powershell
$env:ADSKIP_LIVE_URL = 'https://1shortlink.com/link-encrypted/your-link'
npm run test:live
npm run test:live-extension
npm run test:live:tampermonkey
```

Với full-pages, `test:live` giải mã cục bộ và ghi rõ 0 request. `test:live-extension` thăm trang thật với bộ lọc mạng của bản phát hành, kiểm tra thêm ô dán và ghi nhận request bị chặn. `test:live:tampermonkey` cần gói manager đã giải nén, cài bundle qua editor trong profile mới cho mỗi lượt; riêng harness live này chặn quảng cáo/media bên thứ ba nên không chứng minh khả năng lọc mạng của userscript.

Có thể dùng Chromium/Playwright có sẵn qua `ADSKIP_BROWSER_PATH` và `ADSKIP_PLAYWRIGHT_PATH`. Bằng chứng thô và profile nằm trong `work/`, được bỏ khỏi ZIP.

## Mã nguồn và bằng chứng

- `src/`: logic chung, resolver, transport và widget.
- `extension/`: thư mục nạp trực tiếp; module chung được build từ `src/`.
- `dist/adskip.user.js`: userscript hoàn chỉnh.
- `tests/`: unit, runtime fixture, vòng đời worker và trang thật.
- [Kiến trúc](docs/KIEN_TRUC.md), [báo cáo kiểm thử 1.0](docs/KIEM_THU_1.0.md), [báo cáo 0.3](docs/KIEM_THU_0.3.md), [báo cáo 0.2](docs/KIEM_THU.md), ảnh và JSON đã che dữ liệu trong `docs/`.

Sau khi sửa module chung, build lại, Reload extension và tải lại tab; Tampermonkey cần lưu bundle mới. CodeGraph nằm ở `.codegraph/`; index, dependency và dữ liệu QA không thuộc gói phát hành.

Đóng gói trên Windows sau khi build: `.\scripts\package.ps1`, rồi `.\scripts\verify-package.ps1`. Script dùng danh sách tệp/thư mục cho phép, bỏ cache `_metadata` do Chromium sinh và giữ cấu trúc cài đặt. Verifier kiểm tra version/module/ruleset và quét API key từ input live nếu có. [SHA256](dist/SHA256SUMS-1.0.0.txt) và [kết quả kiểm tra gói](dist/package-check-result.json) đi kèm bản 1.0.
