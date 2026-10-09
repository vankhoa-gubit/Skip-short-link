# Kiến trúc AdSkip 0.2.0

## Các luồng hỗ trợ

```text
Popup full-pages → Base64 URL envelope → URL đích, không cần request

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
| `src/resolver.js` | Adapter, bước xử lý, loop/hop limit, kết quả resolved/manual/error/stopped |
| `src/fetch-transport.js` | Transport service worker, timeout, abort, endpoint/body limit |
| `src/panel.js` | Widget Shadow DOM, lấy dữ liệu trang, chờ DOM có thể hủy, Tiếp tục kiểm tra |
| `src/userscript-entry.js` | GM transport, tùy chọn, clipboard, dữ liệu mới khi tiếp tục và bảo vệ tự mở |
| `extension/background.js` | Job tab và input, thứ tự ghi, phiên bản job, lưu trạng thái, đọc DOM qua content script, điều hướng |
| `extension/content.js` | Widget, trả lời `ADSKIP_PAGE_HINTS` bằng dữ liệu trang hiện tại |
| `extension/popup.js` | Form URL, validation, nguồn kết quả, khôi phục input, tiếp tục/dừng/mở/sao chép |
| `scripts/build.cjs` | Kiểm tra cú pháp, bundle userscript, đồng bộ module dùng chung vào extension |

## Quy tắc URL và request

- Chỉ chấp nhận HTTPS, không có username/password; chặn ký tự điều khiển và input quá dài.
- So khớp ranh giới hostname; domain giả như `gofile.io.example.net` không phải Gofile.
- `/st` giữ URL thô sau `url=` hoặc giải mã lớp bọc, giữ query/chữ ký bên trong.
- Full-pages giải mã Base64 UTF-8, kiểm tra URL đích và từ chối tham số trùng hoặc lớp bọc hỏng.
- Phân tích JavaScript literal; không `eval` mã của trang. POST chỉ tới `/get-link-download` trên cùng origin.
- Resolver tối đa 8 bước và phát hiện vòng lặp. Transport có timeout 15 giây, body tối đa 1 MiB.
- Fragment trực tiếp của `/st` và full-pages được giữ. Qua HTTP redirect, API fetch có thể bỏ fragment trong URL trả về; phạm vi kiểm chứng trong báo cáo.

## Vòng đời và tiếp tục

Content script/userscript chạy ở `document_start` trên frame trên cùng. Với `/st` đã có đích nhận diện được, widget giữ link sớm trước khi site thay URL. Extension có thêm `webNavigation.onBeforeNavigate`.

Trên 1short, widget chờ DOM và có thể đợi tối đa 8 giây để nhận data-href mà site đã lấy trong cùng phiên. Dừng hủy lượt chờ. Khi tiếp tục, userscript đọc trang hiện tại; extension gửi `ADSKIP_PAGE_HINTS` để content script trả dữ liệu mới thay vì dùng lại snapshot.

Job popup link đã dán tách khỏi job tab. Khi mở bước thủ công bằng popup, `manualTabId` gắn job với tab được mở rõ ràng. Tiếp tục chỉ đọc tab đó. Không dùng tùy tiện dữ liệu của tab đang hoạt động khác.

`storage.session` lưu `input`, `tab:<id>` và nguồn popup. `storage.local` lưu `autoOpen`. Link và kết quả được khôi phục khi mở lại popup. Kết quả quá một giờ bị loại khi truy cập lại; đây là hết hạn khi đọc, không phải bộ hẹn giờ xóa nền.

Các lần ghi được xếp hàng theo job và kiểm tra phiên bản. Dừng/job mới/navigation vô hiệu hóa kết quả lượt cũ. Khi worker khởi động lại và còn trạng thái resolving nhưng không còn job sống, chuyển ngay sang stopped với `SESSION_INTERRUPTED`, lưu lại và cho Tìm lại. Không tự khôi phục request bị ngắt.

Tự mở chỉ áp dụng cho job tab, khi người dùng bật tùy chọn, đích là file host nhận diện được và tab vẫn ở URL nguồn phù hợp. Input luôn mở bằng thao tác người dùng. Sender phải thuộc tiện ích; thao tác input chỉ được nhận từ trang extension. URL của tài liệu cũ được kiểm tra trước khi nhận job từ content script.

## Quyền và dữ liệu

Extension yêu cầu `storage`, `activeTab`, `webNavigation`; quyền host giới hạn ở 1shortlink, EZ4Short, Tech8s và các bản www. Userscript khai báo match/connect tương ứng. AdSkip không có backend, telemetry hoặc dịch vụ giải link ngoài.

URL đầy đủ, kể cả API key/ciphertext/query có chữ ký, được giữ cục bộ để mở, sao chép và Tìm lại. Trace che query/payload. Profile, input thật, TLS key và gói Tampermonkey nằm trong `work/` và không thuộc ZIP. Chỉ ảnh/JSON đã kiểm tra mới được đưa vào `docs/`.

## Kiểm thử và mở rộng

Unit/contract test kiểm tra parser, resolver, transport và vòng đời job. Runtime test phân biệt GM shim, extension thật, Tampermonkey thật, server HTTPS fixture và phản hồi trang thật. Worker restart dùng CDP và trạng thái ngắt được gieo trước; không chứng minh việc cưỡng bức đóng đúng lúc request mạng đang chạy.

Thêm adapter cho từng domain/định dạng cụ thể cùng fixture tái hiện luồng thật. Nếu đích chỉ được cấp sau xác minh hoặc trạng thái phía server, người dùng hoàn tất bước đó rồi AdSkip kiểm tra lại. Bản hiện tại không hỗ trợ mọi shortener.
