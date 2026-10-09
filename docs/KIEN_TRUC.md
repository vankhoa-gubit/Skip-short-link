# Kiến trúc AdSkip 1.0.0

## Các luồng hỗ trợ

```text
Popup full-pages → Base64 URL envelope → URL đích, không cần request

EZ4Short /alias → HTTP redirect hoặc nút lấy link đã sẵn sàng → URL đích

Tab hoặc popup link-encrypted
    → dữ liệu data-href/getLink từ DOM mới hoặc HTML
    → POST /get-link-download với phiên và CSRF khi cần
    → /redirect-link
    → EZ4Short /st?…&url=<destination>
    → URL đích

Bước thủ công → người dùng thao tác trên trang
    → Tiếp tục kiểm tra → đọc DOM hiện tại → resolver
```

Payload mã hóa của 1short được gửi như dữ liệu opaque tới endpoint do trang cung cấp. AdSkip không suy đoán khóa giải mã. Với full-pages, chỉ lớp bọc URL Base64 được giải mã cục bộ.

## Các phần

| File | Trách nhiệm |
| --- | --- |
| `src/core.js` | URL/domain, input popup, full-pages, `/st`, lời gọi literal `getLink`, data-href, lỗi HTTP, che trace |
| `src/adapters.js` | Bộ xử lý 1shortlink, EZ4Short và Tech8s; mỗi dịch vụ trả bước tiếp theo hoặc trạng thái thủ công |
| `src/resolver.js` | Điều phối adapter, bước xử lý, loop/hop limit, kết quả resolved/manual/error/stopped |
| `src/ads.js` | Danh sách domain theo dịch vụ, sinh ruleset DNR, chuẩn hóa tùy chọn, ẩn/khôi phục phần tử DOM |
| `src/ad-settings.js` | Xếp hàng thay đổi bộ lọc, áp dụng DNR và lưu tùy chọn, rollback khi lưu thất bại, đồng bộ sau nâng cấp |
| `src/fetch-transport.js` | Transport service worker, timeout, abort, endpoint/body limit |
| `src/panel.js` | Widget Shadow DOM, lấy dữ liệu trang, chờ DOM có thể hủy, Tiếp tục kiểm tra |
| `src/library.js` | Chuẩn hóa cài đặt/lịch sử, xếp hàng ghi, giới hạn lưu, che link nguồn, backend lịch sử mở rộng cho GM |
| `src/batch.js` | Parse tối đa 50 dòng, dedup, hàng đợi serial, Dừng/Chạy tiếp/retry, epoch/revision, phục hồi phiên bị ngắt và tạm dừng 429 |
| `src/workspace.js` | UI chung trong Shadow DOM: Nhiều link, Lịch sử, Cài đặt, clipboard/JSON, bàn phím và responsive |
| `src/userscript-entry.js` | GM transport, tùy chọn, clipboard, dữ liệu mới khi tiếp tục và bảo vệ tự mở |
| `extension/background.js` | Job tab và input, thứ tự ghi, phiên bản job, lưu trạng thái, đọc DOM qua content script, điều hướng |
| `extension/content.js` | Widget, trả lời `ADSKIP_PAGE_HINTS` bằng dữ liệu trang hiện tại |
| `extension/popup.js` | Form URL, validation, nguồn kết quả, khôi phục input, tiếp tục/dừng/mở/sao chép |
| `extension/options.js` | Kết nối manager với worker, clipboard và thông báo storage; options mở thành tab |
| `scripts/build.cjs` | Kiểm tra cú pháp, bundle userscript, đồng bộ module dùng chung và sinh ba ruleset vào extension |

## Quy tắc URL và request

- Chỉ chấp nhận HTTPS, không có username/password; chặn ký tự điều khiển và input quá dài.
- So khớp ranh giới hostname; domain giả như `gofile.io.example.net` không phải Gofile.
- `/st` giữ URL thô sau `url=` hoặc giải mã lớp bọc, giữ query/chữ ký bên trong.
- Full-pages giải mã Base64 UTF-8, kiểm tra URL đích và từ chối tham số trùng hoặc lớp bọc hỏng.
- Phân tích JavaScript literal; không `eval` mã của trang. POST chỉ tới `/get-link-download` trên cùng origin.
- EZ4Short chỉ GET đường dẫn `/alias` gồm 1–128 ký tự chữ/số/gạch dưới/gạch ngang; loại các route quản trị/tài khoản biết trước và không POST form. Đọc `a`/`button` nhận diện qua `redirect-link`, `get-link`, `go-link` hoặc class `get-link`; bỏ nút disabled/hidden, markup inert, URL không an toàn/không hỗ trợ và báo lỗi nếu có nhiều đích khác nhau.
- Resolver tối đa 8 bước và phát hiện vòng lặp. Transport có timeout 15 giây, body tối đa 1 MiB.
- Fragment trực tiếp của `/st` và full-pages được giữ. Qua HTTP redirect, API fetch có thể bỏ fragment trong URL trả về; phạm vi kiểm chứng trong báo cáo.

## Vòng đời và tiếp tục

Content script/userscript chạy ở `document_start` trên frame trên cùng. Với `/st` đã có đích nhận diện được, widget giữ link sớm trước khi site thay URL. Extension có thêm `webNavigation.onBeforeNavigate`.

Trên 1short và alias EZ4Short, widget chờ DOM và có thể đợi tối đa 8 giây để nhận URL trên nút lấy link mà site đã cung cấp trong cùng phiên. Dừng hủy lượt chờ. Khi tiếp tục, userscript đọc trang hiện tại; extension gửi `ADSKIP_PAGE_HINTS` để content script trả dữ liệu mới thay vì dùng lại snapshot.

Job popup link đã dán tách khỏi job tab. Khi mở bước thủ công bằng popup, `manualTabId` gắn job với tab được mở rõ ràng. Tiếp tục chỉ đọc tab đó. Không dùng tùy tiện dữ liệu của tab đang hoạt động khác.

`storage.session` lưu `input`, `tab:<id>`, nguồn popup, `batch` và `dashboardSection`. `storage.local` lưu `autoOpen`, `adFilters`, `appSettings` và `history`. Link/kết quả riêng của popup quá một giờ bị loại khi đọc; batch thuộc phiên trình duyệt, lịch sử được giới hạn theo số bản ghi.

Batch xử lý một link mỗi lần, mặc định chờ 1000 ms giữa các link (500/1000/2000 ms). Epoch + AbortController loại kết quả cũ khi Dừng; revision tăng trên mỗi lần ghi để UI bỏ snapshot cũ. Nếu worker không còn job sống, các dòng queued/resolving chuyển stopped với `SESSION_INTERRUPTED`; dòng đã xong được giữ. 429 chuyển hàng đợi paused; Resume chỉ chạy các dòng còn chờ. Retry chỉ chạy dòng được chọn. Batch không tự điều hướng.

Manager extension dùng các message `ADSKIP_APP_*`; chỉ trang thuộc extension được đọc/ghi hàng đợi, lịch sử và cài đặt. Content script frame chính trên domain hỗ trợ chỉ được mở manager. Bước thủ công của batch gắn `manualTabId` với tab mở bằng nút; Continue đọc DOM mới của đúng tab.

Userscript mở UI chung trong native dialog. Batch dùng adapter bộ nhớ per-page; đóng/tải lại trang kết thúc hàng đợi. GM settings giữ key `autoOpen`/`adFilters` cũ và key `adskip:appSettings` mới. Mỗi lịch sử dùng key `adskip:history:<uuid>`; GM_listValues/GM_deleteValue đọc/xóa/prune từng record. Ghi theo key riêng tránh ghi đè array giữa hai tab. Key `adskip:historyRevision` và GM value listeners cập nhật manager ở tab khác. Không có giao dịch toàn cục GM; Clear/prune có thể chạy đồng thời với các tab đang xử lý. Manager userscript không đọc DOM ở tab khác; người dùng tiếp tục bằng widget trong tab được mở.

Lịch sử mặc định bật, giữ 100 (25/100/250) record. Chỉ ghi kết quả resolved/manual/error; kết quả stopped và dòng nhập sai không được ghi. Nhãn nguồn dùng `Core.describeUrl`; link gốc/query/API key/ciphertext không thuộc record. Resolved giữ URL file host đầy đủ; manual/error có url null. JSON xuất áp dụng cùng quy tắc. Lỗi ghi lịch sử không thay kết quả tìm đích; hiển thị cảnh báo để người dùng xử lý.

Các lần ghi được xếp hàng theo job và kiểm tra phiên bản. Dừng/job mới/navigation vô hiệu hóa kết quả lượt cũ. Khi worker khởi động lại và còn trạng thái resolving nhưng không còn job sống, chuyển ngay sang stopped với `SESSION_INTERRUPTED`, lưu lại và cho Tìm lại. Không tự khôi phục request bị ngắt.

Tự mở chỉ áp dụng cho job tab, khi người dùng bật tùy chọn, đích là file host nhận diện được và tab vẫn ở URL nguồn phù hợp. Input luôn mở bằng thao tác người dùng. Sender phải thuộc tiện ích; thao tác input chỉ được nhận từ trang extension. URL của tài liệu cũ được kiểm tra trước khi nhận job từ content script.

## Quyền và dữ liệu

Extension yêu cầu `storage`, `activeTab`, `webNavigation`, `declarativeNetRequest`; quyền host vẫn giới hạn ở 1shortlink, EZ4Short, Tech8s và các bản www. Quyền DNR cho phép block request theo quy tắc mà không thêm quyền host cho các mạng quảng cáo. Userscript khai báo match/connect tương ứng và `GM_addValueChangeListener` để đồng bộ tùy chọn quảng cáo. AdSkip không có backend, telemetry hoặc dịch vụ giải link ngoài.

## Bộ lọc quảng cáo

| Dịch vụ khởi tạo request | Domain quảng cáo được lọc |
| --- | --- |
| 1shortlink | `googlesyndication.com`, `doubleclick.net`, `3nbf4.com`, `jhnwr.com`, `forfrogadiertor.com` |
| EZ4Short | `googlesyndication.com`, `doubleclick.net` |
| Tech8s | `googlesyndication.com`, `doubleclick.net` |

DNR dùng `initiatorDomains` để giới hạn trang khởi tạo và `requestDomains` để so khớp ranh giới domain/subdomain. Lọc script, ảnh, XHR/fetch, iframe, ping, media và other; không chặn điều hướng main frame. Do đó chưa có cam kết chặn mọi popup hoặc mọi mạng quảng cáo. Tài nguyên first-party, Cloudflare Turnstile, Google reCAPTCHA và file host không nằm trong danh sách.

Các domain riêng của 1short được lấy từ tài nguyên trang đã quan sát; lượt live 0.3 xác nhận hai script từ `3nbf4.com` và `forfrogadiertor.com` bị chặn. Google ad domains là danh sách cơ sở cho cả ba dịch vụ; chưa xác nhận mức phủ quảng cáo trên alias EZ4Short/Tech8s thật.

Ba static ruleset mặc định bật. Thay đổi được xếp hàng, áp dụng native rồi lưu. Nếu lưu thất bại, khôi phục ruleset trước đó; nếu cả rollback thất bại, báo lỗi riêng và lần đọc popup tiếp theo đồng bộ lại. Khi worker chạy, cài/nâng cấp, startup hoặc tùy chọn thay đổi, đọc lại lựa chọn đã lưu. [Chrome DNR](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest) mô tả enabled static ruleset được giữ giữa các phiên nhưng reset khi nâng cấp extension.

Bộ lọc DOM chung chỉ đánh dấu iframe/ảnh tới các domain quảng cáo và `ins.adsbygoogle`, quan sát phần tử mới/thay đổi `src` hoặc class. Khi tắt hoặc phần tử không còn khớp, khôi phục marker trước đó; không sửa CSS/hidden gốc của trang. Userscript chỉ có phần lọc DOM, request vẫn xảy ra. Extension có cả DNR và phần lọc DOM. Cache `extension/_metadata` do Chromium sinh được bỏ khỏi Git và ZIP.

URL nguồn đầy đủ, kể cả API key/ciphertext, chỉ được giữ trong phiên extension/bộ nhớ trang userscript để Tìm lại. URL đích có chữ ký được giữ đầy đủ trong lịch sử cục bộ/file xuất để mở/sao chép đúng. Trace che query/payload. Profile, input thật, TLS key và gói Tampermonkey nằm trong `work/` và không thuộc ZIP. Chỉ ảnh/JSON đã kiểm tra mới được đưa vào `docs/`.

## Kiểm thử và mở rộng

Unit/contract test kiểm tra parser, resolver, transport và vòng đời job. Runtime test phân biệt GM shim, extension thật, Tampermonkey thật, server HTTPS fixture và phản hồi trang thật. Worker restart dùng CDP và trạng thái ngắt được gieo trước; không chứng minh việc cưỡng bức đóng đúng lúc request mạng đang chạy.

Thêm adapter cho từng domain/định dạng cụ thể cùng fixture tái hiện luồng thật. Nếu đích chỉ được cấp sau xác minh hoặc trạng thái phía server, người dùng hoàn tất bước đó rồi AdSkip kiểm tra lại. Bản hiện tại không hỗ trợ mọi shortener.
