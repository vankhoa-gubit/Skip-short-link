# Changelog

## 1.0.0 — 2026-10-09

- Manager dùng chung cho extension và userscript: Nhiều link, Lịch sử, Cài đặt.
- Batch tối đa 50 dòng, dedup, serial, Dừng/Chạy tiếp/retry, tạm dừng 429; không tự mở đích.
- Extension phục hồi hàng đợi phiên sau worker restart, tiếp tục thủ công từ đúng tab được mở.
- Lịch sử cục bộ với tìm kiếm/lọc, xóa, mở/sao chép và JSON; che link nguồn, giữ URL đích đầy đủ.
- Tùy chọn retention 25/100/250, delay 500/1000/2000 ms; giữ auto-open/ad filters từ 0.3.
- GM history theo từng record để giữ kết quả ghi đồng thời ở nhiều tab; listeners đồng bộ manager.
- Userscript có metadata cập nhật; ZIP cài cục bộ, hướng dẫn nâng cấp và bằng chứng kiểm thử 1.0.

## 0.3.0 — 2026-10-09

- EZ4Short alias redirect/nút sẵn sàng và tiếp tục với DOM mới.
- DNR theo dịch vụ cho extension; lọc khung quảng cáo cho userscript.
- Adapter theo dịch vụ và mở rộng kiểm thử HTTPS/Tampermonkey.

## 0.2.0 — 2026-10-09

- Ô dán link popup, khôi phục kết quả, tiếp tục thủ công.
- Full-pages Base64, xử lý phiên ngắt, dừng và lỗi HTTP.
