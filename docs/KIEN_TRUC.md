# Kiến trúc AdSkip

## Luồng đã khảo sát

```text
1short /link-encrypted/<opaque payload>
    → getLink hoặc data-href trong DOM
    → POST /get-link-download với phiên và CSRF mới khi cần
    → /redirect-link?link=<opaque payload>
    → HTTP redirect tới EZ4Short /st?api=<publisher>&url=<destination>
    → lấy destination trước khi đi tiếp vào chuỗi quảng cáo
```

Payload 1short có các trường `iv`, `value`, `mac`, `tag`. Bộ xử lý sử dụng nó như dữ liệu opaque, gửi tới endpoint do trang cung cấp. Không suy đoán khóa giải mã. Điểm giúp rút ngắn luồng trong mẫu khảo sát là URL đích đã có ở tham số `url` của `/st`.

## Các phần

| File | Trách nhiệm |
| --- | --- |
| `src/core.js` | Kiểm tra URL/domain; đọc `/st`; phân tích lời gọi literal `getLink` và `data-href`; che query trong trace |
| `src/resolver.js` | Đi qua adapter, theo các bước được hỗ trợ, dừng khi gặp file host hoặc bước thủ công |
| `src/fetch-transport.js` | Request cho service worker, timeout, abort và giới hạn body |
| `src/panel.js` | Widget Shadow DOM tiếng Việt, tìm dữ liệu trang, xử lý `/st` sớm |
| `src/userscript-entry.js` | GM transport, lưu tùy chọn, clipboard và vòng đời userscript |
| `extension/background.js` | Resolver trong service worker, trạng thái riêng mỗi tab, hủy job, badge, nhận navigation `/st` |
| `extension/content.js` | Đọc dữ liệu DOM của tab và hiển thị widget |
| `extension/popup.js` | Đọc trạng thái tab hiện tại và gửi thao tác tới service worker |
| `scripts/build.cjs` | Kiểm tra cú pháp, ghép userscript và đồng bộ module dùng chung vào extension |

## Quy tắc xử lý URL

- Chỉ chấp nhận HTTPS, không có username/password trong URL; chặn ký tự điều khiển và input quá dài.
- So khớp ranh giới hostname: `gofile.io.example.net` không phải Gofile.
- Đối với `/st` dạng quan sát được, giữ phần URL thô sau `url=` để không làm mất `&`, `+`, `%` và fragment của URL đích.
- Với URL mã hóa, chỉ giải mã lớp bọc đến khi có URL hợp lệ, giữ nguyên query bên trong.
- Chỉ phân tích lời gọi JavaScript literal; không `eval` mã của trang. POST 1short phải tới đúng `/get-link-download` trên cùng origin.
- Resolver giới hạn 8 bước, có phát hiện vòng lặp. Transport extension có timeout 15 giây và body tối đa 1 MiB.

## Vòng đời trình duyệt

Content script và userscript chạy ở `document_start`, trên frame trên cùng. Với `/st` đã chứa một đích được nhận diện, widget có thể dừng việc tải trang và tạo nền DOM tối thiểu để giữ link trước khi site tự chuyển bước. Extension cũng dùng `webNavigation.onBeforeNavigate` để giữ URL ban đầu.

Trên 1short, widget đợi DOM và có thể đợi tối đa 8 giây để đọc `data-href` mà JavaScript của site đã lấy. Cách này dùng cùng phiên đang mở. Nếu chưa có, resolver phân tích HTML và dùng endpoint với token mới.

`storage.session` lưu trạng thái theo tab; `storage.local` lưu `autoOpen`. Kết quả cũ quá một giờ không được dùng qua `stateOf`. Job cũ bị hủy và các lần ghi trạng thái được xếp hàng. Tự mở cần đích được nhận diện và tab còn ở dịch vụ được hỗ trợ; kết quả một job cũ không được đổi tab đã chuyển URL.

## Quyền và dữ liệu

Extension yêu cầu `storage`, `activeTab`, `webNavigation`; quyền host giới hạn ở `1shortlink.com`, `ez4short.com`, `tech8s.net` và các bản `www`. Userscript khai báo `@match` và `@connect` tương ứng. Không có backend của AdSkip, telemetry hay dịch vụ giải link ngoài.

URL đích đầy đủ được giữ trong trạng thái cục bộ để mở/sao chép đúng chữ ký. Danh sách bước dùng URL đã che query và payload 1short. Profile/test result ở `work/` là dữ liệu cục bộ và không được đóng gói tự động.

Quyền và phạm vi thực thi tham khảo tài liệu [Chrome content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts) và [cross-origin network requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests). Cách nạp extension trong Chromium kiểm thử theo [Playwright](https://playwright.dev/docs/chrome-extensions).

## Mở rộng

Thêm adapter theo domain và một định dạng link cụ thể, kèm fixture tái hiện các bước thực tế. Nếu link cuối chỉ được cấp sau CAPTCHA, countdown hoặc trạng thái phía server, cần khảo sát riêng. Bộ xử lý hiện tại trả trạng thái thủ công cho các dạng thiếu dữ liệu đích; chưa có cơ chế chung cho tất cả shortener.
