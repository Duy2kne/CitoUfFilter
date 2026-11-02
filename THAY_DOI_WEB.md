# THAY ĐỔI VÀ HƯỚNG DẪN DỰ ÁN CITO UF FILTER (WEB BLUETOOTH)

Ứng dụng web điều khiển máy lọc nước hồ cá (lọc màng UF) qua **Web Bluetooth** theo đúng giao thức Firmware 1.0.0 (`ble_control.cpp` / `filter.h` / `history.h`).

---

## 1. Cấu trúc thư mục & danh sách file

| File | Vai trò |
|---|---|
| `src/types/system.ts` | Khai báo kiểu dữ liệu gói `st`, `cf`, `ack`, `hi`, `wl`, UUID Bluetooth, bảng 10 mã lỗi và gợi ý xử lý, các hàm định dạng dòng (`formatCurrent`), thời gian (`formatDuration`), tính tuổi TDS. |
| `src/services/scheduleCalculator.ts` | Hàm thuần tính toán lịch lọc tự động, xử lý khung giờ qua nửa đêm (VD: Ban đêm 23:00–05:00, ngày chẵn/lẻ, thứ trong tuần), tạo mảng 24 giờ xem trước hôm nay. |
| `src/services/packetParser.ts` | Hàm thuần `applyPacket(prev, pkt)` cập nhật trạng thái ứng dụng và lớp `PacketAssembler` ghép mảnh gói BLE theo dòng `\n` với `TextDecoder({stream: true})`. |
| `src/services/history.ts` | Dịch sự kiện nhật ký sang câu tiếng Việt, giải mã cờ bit 31 (trước khi có giờ), định dạng giờ địa phương (`getUTC*`), tính tổng phút lọc hôm nay và 7 ngày qua. |
| `src/services/demo.ts` | **Máy giả lập trong trình duyệt**: chạy lịch thật theo đồng hồ máy tính, biến thiên TDS 120–180 ppm, phản hồi mọi lệnh như máy thật, có bộ phát lỗi thử nghiệm giao diện. |
| `src/services/bleService.ts` | Quản lý Web Bluetooth (`UfBleManager`): kết nối, hàng đợi lệnh FIFO với timeout ACK 5s, tự động gửi AUTH (`1234`), gửi `TIME_SET`, tự kết nối lại 3 lần. |
| `src/components/Navbar.tsx` | Thanh điều hướng trên cùng: chấm trạng thái kết nối, tên máy, nút Kết nối / Ngắt kết nối, nhãn DEMO. |
| `src/components/HomeTab.tsx` | **Trang chính**: Vòng tròn đo tiến độ mượt mà, số đo TDS lớn nổi bật, đếm lùi lượt lọc kế tiếp, nút Bật/Tắt, Lọc ngay / Dừng lọc, thẻ chẩn đoán Bơm/Van/Nhiệt độ/Điện năng và khung xử lý lỗi. |
| `src/components/ScheduleTab.tsx` | **Lịch lọc**: 6 chế độ lọc có biểu tượng trực quan, thanh trượt phút/giờ (`fmin`), chọn ngày chẵn/lẻ/thứ, thanh ngang 24 giờ xem trước hôm nay, nút Lưu lịch chỉ gửi các khóa đã sửa. |
| `src/components/HistoryTab.tsx` | **Nhật ký**: Tổng hợp phút lọc hôm nay & 7 ngày, danh sách sự kiện tiếng Việt nhóm theo ngày, bộ lọc Lượt lọc/Lỗi/Cài đặt, nút Tải lại và Xóa nhật ký. |
| `src/components/TechTab.tsx` | **Kỹ thuật**: Cấu hình van, tự đo TDS, bảo vệ dòng (tự gợi ý ngưỡng), hiệu chuẩn TDS 3 bước, hiệu chuẩn cảm biến ACS712 (0 A và ampe kìm), quét WiFi nhà, thông tin máy, đổi mã PIN. |
| `src/components/ConnectModal.tsx` | Hộp thoại kết nối Bluetooth, vào chế độ Demo, quản lý PIN đã lưu trong trình duyệt, hướng dẫn trình duyệt (Chrome, Edge, Bluefy trên iOS). |
| `src/components/PinModal.tsx` | Hộp thoại nhập lại mã PIN khi máy báo sai hoặc khi bị ngắt kết nối. |
| `src/components/ConfirmModal.tsx` | Hộp thoại xác nhận trước các thao tác nhạy cảm (Tắt máy, Khởi động lại, Về mặc định, Xóa nhật ký). |
| `src/components/Toast.tsx` | Thông báo nổi xanh/đỏ phản hồi lệnh từ máy lọc. |
| `tests/*.test.ts` | Bộ kiểm thử Vitest cho ghép gói UTF-8, giá trị `null`, định dạng dòng, mã lỗi, bit 31 nhật ký, và thuật toán tính lịch qua nửa đêm. |
| `.github/workflows/deploy.yml` | Workflow GitHub Actions tự động build và deploy lên GitHub Pages khi push code. |

---

## 2. Cách chạy và phát triển cục bộ

```bash
# 1. Cài đặt thư viện
npm install

# 2. Chạy môi trường phát triển (Dev server port 3000)
npm run dev

# 3. Chạy kiểm tra kiểu dữ liệu (TypeScript lint)
npm run lint

# 4. Chạy toàn bộ unit test Vitest
npm run test

# 5. Build bản phát hành production (thư mục dist/)
npm run build
```

---

## 3. Cách đưa lên GitHub & Triển khai GitHub Pages

1. Tạo một repository mới trên GitHub (ví dụ: `cito-uf-filter-web`).
2. Trong thư mục dự án, chạy các lệnh git:
   ```bash
   git init
   git add .
   git commit -m "feat: hoan thanh web app CITO UF FILTER Bluetooth theo Firmware 1.0.0"
   git branch -M main
   git remote add origin https://github.com/<tai-khoan-cua-ban>/cito-uf-filter-web.git
   git push -u origin main
   ```
3. Kích hoạt GitHub Pages trên repository:
   - Vào mục **Settings** của repository trên GitHub.
   - Chọn mục **Pages** ở thanh bên trái.
   - Tại mục **Build and deployment > Source**, chọn **GitHub Actions**.
   - Workflow `.github/workflows/deploy.yml` sẽ tự động chạy và cung cấp đường link web truy cập công khai.
