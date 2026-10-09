# Báo cáo kiểm thử AdSkip 0.3.0

**Ngày:** 09/10/2026, Asia/Bangkok. **Môi trường:** Windows, Node.js 24.21.0, Playwright 1.62.1, Chromium 151.0.7922.34, Tampermonkey 5.4.1. Bản 0.3 được phát triển từ commit 0.2 `8fabc99`. Các lượt trình duyệt dùng profile QA riêng trong `work/`.

## Kết quả

| Hạng mục | Trạng thái | Phạm vi |
| --- | --- | --- |
| Build/cú pháp | PASS | Bundle userscript, module extension, ba ruleset DNR |
| Unit/contract | PASS, 61/61 | Core 18, resolver 17, background 15, transport 4, ad settings/rules 7; API Chrome được stub trong Node |
| Userscript với GM shim | PASS, 7 kiểm tra | Hồi quy widget và hợp đồng GM; chưa phải manager cài thật |
| Extension fixture cũ | PASS, 7 kiểm tra | Extension unpacked và `chrome.*` thật; mạng fixture intercepted |
| Popup/tiếp tục 0.2 | PASS, 10 kiểm tra | Chạy lại với mã 0.3, server HTTPS fixture, chrome API thật |
| Extension 0.3 | PASS, 11 kiểm tra | DNR thật, server HTTPS thật, không Playwright interception; alias, scope, bật/tắt, giữ tài nguyên thiết yếu, khởi động lại browser |
| Worker lifecycle | PASS, 3 kiểm tra | Worker thật đóng bằng CDP; trạng thái gián đoạn được gieo trước; retry |
| Tampermonkey thật, fixture | PASS, 10 kiểm tra | Cài bundle bằng editor trong profile mới; GM API, alias, ẩn/khôi phục phần tử và đồng bộ giữa tab |
| Link full-pages được cung cấp | PASS, 0 request | Giải mã cục bộ; không phải kiểm tra HTTP |
| Extension trên trang thật + popup | PASS, 3 kiểm tra | DNR bản phát hành đang bật; không interception/DNS mapping/chứng chỉ QA; cùng đích Gofile, 0 page error |
| Tampermonkey trên trang thật | PASS, 3 kiểm tra | Cài bằng editor, real GM; harness riêng chặn 14 request quảng cáo/media; 0 page error |
| Giao diện | PASS trong kích thước đã xem | 1440×900, widget 390×844, popup 360px; hồi quy popup 320px/focus |
| Alias EZ4Short thật, quảng cáo Tech8s thật | NOT RUN | Chưa có link alias thật từ người dùng; kiểm chứng các dạng và bộ lọc bằng fixture |
| Chrome/Edge profile cá nhân, Firefox, thiết bị mobile thật | NOT RUN | Các lượt dùng Chromium QA; viewport mobile thuộc browser desktop |
| File Gofile tải được, CAPTCHA/mật khẩu thật | NOT RUN | Dừng ở URL đích; bước thủ công kiểm tra bằng fixture |

## Kiểm chứng bộ lọc mạng

Suite `test:extension:v03` không dùng `context.route` hay can thiệp network của Playwright. Server HTTPS cục bộ ghi lại request thực nhận, hostname chỉ được ánh xạ trong tham số Chromium; không đổi DNS/chứng chỉ hệ thống.

- Trên 1short bật lọc: script và iframe `3nbf4.com` trả `ERR_BLOCKED_BY_CLIENT` phía browser và **0 request tới server**. URL đích có query/fragment, script first-party, tài nguyên Vexfile và iframe mô phỏng xác minh Cloudflare vẫn hoạt động.
- Tắt từ widget: ruleset native tắt và phần tử DOM được khôi phục; tải trang tiếp theo khiến quảng cáo tới server.
- Tùy chọn popup độc lập cho ba dịch vụ, đồng bộ widget đã mở, không thay đổi `autoOpen`.
- EZ4Short bản www bật/tắt quảng cáo Google theo tùy chọn riêng. Tech8s vẫn ở trạng thái thủ công và bộ lọc hoạt động.
- Trang `example.org` ngoài scope vẫn tải cùng domain quảng cáo và không có widget/ẩn DOM.
- Đóng/mở browser với profile QA giữ ba lựa chọn và đúng native ruleset. Việc reset ruleset sau nâng cấp được mô phỏng trong unit test sự kiện `onInstalled`, chưa thử nâng cấp extension trong Chrome cá nhân.

Userscript được kiểm chứng riêng: iframe quảng cáo đã thực sự tới server nhưng bị ẩn, iframe xác minh vẫn hiện. Tắt khôi phục phần tử; GM lưu lựa chọn, tab mới đọc đúng lựa chọn và `GM_addValueChangeListener` cập nhật tab khác đang mở. Phần tử mới bị nhận diện; thay `src` sang domain xác minh thì được khôi phục. Đây là lọc hiển thị, không phải chặn request.

## Alias EZ4Short

Fixture kiểm tra:

1. Popup dán `/alias`: service worker GET HTML thật và đọc nút lấy link đã sẵn sàng; giữ query/chữ ký/fragment; không POST và không request file.
2. Popup dán alias trả HTTP 302 tới `/st`: xử lý đích với query đầy đủ.
3. Nút disabled và form chưa cấp đích: giữ trạng thái thủ công. Sau thao tác người dùng, **Tiếp tục kiểm tra** đọc DOM mới, không lặp GET hay tự submit form.
4. Tampermonkey cài thật nhận control, HTTP redirect và tiếp tục sau thao tác tương tự.
5. Parser/transport unit kiểm tra route giới hạn, route tài khoản, URL không an toàn, markup inert, nhiều đích, lỗi 403/410/429, body limit, vòng lặp và cancellation.

Mẫu người dùng cung cấp cho lượt này vẫn là link 1short full-pages. Chưa thể kết luận mọi alias EZ4Short thật hoạt động từ các fixture trên.

## Link thật

```text
Mở full-pages → HTTP 302 → 1short link-encrypted
    → URL trang đã cung cấp → redirect-link → EZ4Short /st → Gofile

Dán full-pages trong popup → giải mã Base64 cục bộ → cùng Gofile
```

Đích đã xác nhận: [https://gofile.io/d/PKvjP6Yd](https://gofile.io/d/PKvjP6Yd). Tự mở tắt, không tải file.

Lượt extension dùng DNR bản phát hành, đã ghi nhận script `3nbf4.com` và `forfrogadiertor.com` bị chặn. Tài nguyên còn lại của trang thật được phép tải bình thường, có 0 page error. Lượt live Tampermonkey dùng harness chặn quảng cáo/media như suite trước; không dùng lượt này để chứng minh userscript lọc mạng. Bằng chứng lọc hiển thị của userscript nằm ở suite manager + HTTPS fixture.

## Giới hạn

- Danh sách domain lọc có phạm vi cụ thể; không xác nhận mọi quảng cáo, popup hay shortener.
- Fragment đọc từ DOM, full-pages và `/st` trực tiếp được giữ. `fetch().url` có thể bỏ fragment qua HTTP redirect; không cam kết giữ mọi fragment trong chuỗi chuyển hướng mạng.
- Profile Tampermonkey unpacked dùng lại từng gây cảnh báo nguồn script. Mỗi suite cài bundle bằng editor trong profile mới; chưa chứng minh mọi trường hợp khôi phục profile manager.
- Worker lifecycle kiểm tra worker thật khởi động lại nhưng dùng trạng thái resolving gieo trước, không đóng đúng lúc request thật đang chạy.
- Popup được mở dưới dạng trang extension để điều khiển; chưa thao tác toolbar/native popup trong profile Chrome/Edge cá nhân.
- Test “giữ xác minh” chứng minh request/iframe fixture được giữ; không giải hoặc xác nhận CAPTCHA thật.

## Bằng chứng và đóng gói

JSON hiện tại nằm trong `docs/evidence/v03/`: unit, userscript shim, extension, extension-v02, extension-v03, worker, Tampermonkey, giải mã local và hai lượt live. Ảnh 0.3 trong `docs/screenshots/` có tiền tố `extension-v03`, `tampermonkey-v03` và `live-v03`. Bằng chứng 0.2 được giữ ở vị trí cũ cùng [báo cáo 0.2](KIEM_THU.md).

ZIP `dist/AdSkip-0.3.0.zip` được tạo bằng danh sách cho phép trong `scripts/package.ps1`. Kiểm tra gói xác nhận phiên bản 0.3.0, các module/ruleset cần thiết, bản sao module đồng nhất và không có API key thật trong tệp văn bản. `work/`, input thật, TLS key, profiles, manager, browsers, dependencies, Git/CodeGraph và cache `_metadata` không thuộc gói.
