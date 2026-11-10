/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ERROR_COUNT, ERROR_DEFINITIONS, FILTER_MODES, HistoryEventTuple } from '../types/system';

export interface FormattedHistoryEvent {
  raw: HistoryEventTuple;
  timeText: string;
  dateKey: string;
  dateHeader: string;
  title: string;
  detail: string;
  sourceText: string;
  category: 'run' | 'error' | 'system' | 'config';
  icon: string;
  badgeColor: string;
}

const SOURCE_MAP: Record<number, string> = {
  0: 'Tự động',
  1: 'Nút trên máy',
  3: 'Ứng dụng',
  4: 'Bảo vệ máy',
  5: 'Hết giờ hẹn',
  6: 'Nạp firmware',
  7: 'Giờ Internet',
};

const RESET_REASON_MAP: Record<number, string> = {
  1: 'Cắm nguồn điện',
  3: 'Khởi động phần mềm',
  4: 'Khởi động lại khẩn cấp (Panic)',
  5: 'Watchdog khởi động lại (Treo)',
  6: 'Task Watchdog',
  7: 'Other Watchdog',
  9: 'Sụt nguồn (Brownout)',
};

/**
 * Checks if timestamp has bit 31 set (device had no clock at the time)
 */
export function hasNoClockBit(t: number): boolean {
  return (t >>> 31) === 1;
}

/**
 * Extracts display time text and date headers from local epoch seconds
 * Note: Firmware transmits t already adjusted for local timezone offset.
 * We must use getUTC* methods to render the exact local date/time representation.
 */
export function formatEventTimestamp(t: number): {
  timeText: string;
  dateKey: string;
  dateHeader: string;
  utcDate: Date;
  isUptime: boolean;
} {
  if (hasNoClockBit(t)) {
    const uptimeSec = t & 0x7fffffff;
    const mins = Math.floor(uptimeSec / 60);
    const secs = uptimeSec % 60;
    const timeText = mins > 0 ? `+${mins} ph ${secs}s` : `+${secs}s`;
    return {
      timeText: `${timeText} sau khởi động`,
      dateKey: 'no_clock',
      dateHeader: 'Trước khi có giờ chuẩn (chạy theo thời gian bật máy)',
      utcDate: new Date(0),
      isUptime: true,
    };
  }

  // Real timestamp in device's local timezone (transmitted as epoch seconds)
  const d = new Date(t * 1000);
  const hours = d.getUTCHours().toString().padStart(2, '0');
  const minutes = d.getUTCMinutes().toString().padStart(2, '0');
  const timeText = `${hours}:${minutes}`;

  const year = d.getUTCFullYear();
  const month = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = d.getUTCDate().toString().padStart(2, '0');
  const dateKey = `${year}-${month}-${day}`;

  // Check today / yesterday in local UTC comparison
  const now = new Date();
  const nowUtcDay = now.getDate();
  const nowUtcMonth = now.getMonth() + 1;
  const nowUtcYear = now.getFullYear();

  let dateHeader = `Ngày ${day}/${month}/${year}`;
  if (year === nowUtcYear && Number(month) === nowUtcMonth) {
    if (Number(day) === nowUtcDay) {
      dateHeader = 'Hôm nay';
    } else if (Number(day) === nowUtcDay - 1) {
      dateHeader = 'Hôm qua';
    }
  }

  return {
    timeText,
    dateKey,
    dateHeader,
    utcDate: d,
    isUptime: false,
  };
}

/**
 * Translates a raw history event tuple into a structured Vietnamese record
 */
export function formatHistoryEvent(raw: HistoryEventTuple): FormattedHistoryEvent {
  const [t, type, src, val] = raw;
  const { timeText, dateKey, dateHeader } = formatEventTimestamp(t);
  const sourceText = SOURCE_MAP[src] || `Nguồn ${src}`;

  let title = 'Sự kiện';
  let detail = '';
  let category: FormattedHistoryEvent['category'] = 'system';
  let icon = 'info';
  let badgeColor = 'text-slate-400 bg-slate-800/60 border-slate-700';

  switch (type) {
    case 1: {
      // Boot event
      category = 'system';
      icon = 'power';
      const reason = RESET_REASON_MAP[src] || `Lý do ${src}`;
      const major = (val >> 10) & 0x3f;
      const minor = (val >> 5) & 0x1f;
      const patch = val & 0x1f;
      const fwVer = major > 0 || minor > 0 ? `v${major}.${minor}.${patch}` : '';
      title = `Khởi động máy (${reason})`;
      detail = fwVer ? `Phiên bản firmware ${fwVer}` : 'Máy sẵn sàng hoạt động';
      badgeColor = 'text-slate-300 bg-slate-800/80 border-slate-700';
      break;
    }

    case 2: {
      // Power on / off
      category = 'system';
      const isOn = val === 1;
      icon = isOn ? 'power' : 'circle-off';
      title = isOn ? 'Bật máy lọc' : 'Tắt máy lọc';
      detail = isOn ? 'Máy chuyển sang trạng thái chờ lọc' : 'Đã dừng mọi hoạt động';
      badgeColor = isOn
        ? 'text-emerald-300 bg-emerald-950/60 border-emerald-800/40'
        : 'text-slate-400 bg-slate-900 border-slate-800';
      break;
    }

    case 3: {
      // Change filter mode
      category = 'config';
      icon = 'sliders';
      const mode = FILTER_MODES.find((m) => m.id === val);
      const modeName = mode ? mode.name : `Chế độ ${val}`;
      title = `Đổi chế độ lọc: ${modeName}`;
      detail = mode ? `Khung giờ: ${mode.hours}` : '';
      badgeColor = 'text-cyan-300 bg-cyan-950/60 border-cyan-800/40';
      break;
    }

    case 4: {
      // Filter cycle completed
      category = 'run';
      icon = 'droplet';
      const runMins = Math.floor(val / 60);
      const runSecs = val % 60;
      const durationStr = runMins > 0 ? `${runMins} phút ${runSecs > 0 ? `${runSecs}s` : ''}` : `${runSecs} giây`;

      let cycleType = 'Lọc theo lịch';
      if (src === 1) cycleType = 'Lọc tay';
      else if (src === 2) cycleType = 'Đo TDS';
      else if (src === 3) cycleType = 'Thay nước (xả)';

      title = `${cycleType}: Hoàn thành ${durationStr}`;
      detail = `Bơm chạy an toàn trong ${val} giây`;
      badgeColor = 'text-blue-300 bg-blue-950/60 border-blue-800/40';
      break;
    }

    case 5: {
      // Fault appeared
      category = 'error';
      icon = 'alert-triangle';
      const errNames: string[] = [];
      for (let b = 0; b < ERROR_COUNT; b++) {
        if ((val & (1 << b)) !== 0) {
          const def = ERROR_DEFINITIONS[b + 1];
          if (def) errNames.push(`${def.code}: ${def.name}`);
        }
      }
      title = errNames.length > 0 ? `Lỗi: ${errNames[0]}` : `Phát hiện lỗi mã 0x${val.toString(16)}`;
      detail = errNames.slice(1).join(', ') || 'Hệ thống đã ghi nhận lỗi';
      badgeColor = 'text-rose-300 bg-rose-950/70 border-rose-800/50';
      break;
    }

    case 6: {
      // Fault cleared
      category = 'error';
      icon = 'check-circle';
      title = 'Đã xóa lỗi';
      detail = 'Máy tiếp tục theo dõi ở các lượt lọc kế tiếp';
      badgeColor = 'text-emerald-300 bg-emerald-950/60 border-emerald-800/40';
      break;
    }

    case 7: {
      // Manual filter start / stop
      category = 'run';
      const isStart = val === 1;
      icon = isStart ? 'play' : 'square';
      title = isStart ? 'Bắt đầu lọc tay' : 'Dừng lọc tay';
      if (src === 5) {
        detail = 'Tự động dừng do hết thời gian hẹn';
      } else if (src === 4) {
        detail = 'Dừng khẩn cấp do phát hiện lỗi';
      } else {
        detail = isStart ? 'Người dùng yêu cầu lọc ngay' : 'Người dùng bấm dừng lọc';
      }
      badgeColor = 'text-indigo-300 bg-indigo-950/60 border-indigo-800/40';
      break;
    }

    case 8: {
      // Settings changed
      category = 'config';
      icon = 'settings';
      title = `Lưu ${val} mục cài đặt`;
      detail = 'Cài đặt đã được đồng bộ vào máy';
      badgeColor = 'text-amber-300 bg-amber-950/60 border-amber-800/40';
      break;
    }

    case 9: {
      // Factory reset
      category = 'config';
      icon = 'rotate-ccw';
      title = 'Khôi phục cài đặt mặc định';
      detail = 'Giữ lại cấu hình WiFi và hiệu chuẩn cảm biến';
      badgeColor = 'text-orange-300 bg-orange-950/60 border-orange-800/40';
      break;
    }

    case 10: {
      // Current calibration
      category = 'config';
      icon = 'activity';
      if (val === 0) {
        title = 'Đo điểm 0 A cảm biến dòng';
        detail = 'Đã lấy mẫu điện áp tĩnh khi bơm/van tắt';
      } else if (val === 11) {
        title = 'Chỉnh hệ số dòng Bơm (Ampe kìm)';
        detail = 'Đã hiệu chuẩn k_p theo số đo thực tế';
      } else if (val === 12) {
        title = 'Chỉnh hệ số dòng Van lọc (Ampe kìm)';
        detail = 'Đã hiệu chuẩn k_v theo số đo thực tế';
      } else {
        title = 'Chỉnh hệ số dòng Van xả (Ampe kìm)';
        detail = 'Đã hiệu chuẩn k_d theo số đo thực tế';
      }
      badgeColor = 'text-teal-300 bg-teal-950/60 border-teal-800/40';
      break;
    }

    case 11: {
      // WiFi connected
      category = 'system';
      icon = 'wifi';
      title = 'Đã kết nối WiFi nhà';
      detail = `Mức sóng: -${val} dBm`;
      badgeColor = 'text-sky-300 bg-sky-950/60 border-sky-800/40';
      break;
    }

    case 12: {
      // OTA Finished
      category = 'system';
      icon = 'download';
      title = 'Cập nhật firmware thành công';
      detail = 'Đã nạp xong bản nâng cấp mới qua WiFi';
      badgeColor = 'text-emerald-300 bg-emerald-950/60 border-emerald-800/40';
      break;
    }

    case 13: {
      // Time sync
      category = 'system';
      icon = 'clock';
      title = src === 7 ? 'Nhận giờ từ Internet (NTP)' : 'Đồng bộ giờ từ điện thoại';
      detail = 'Lịch lọc tự động hoạt động chính xác theo giờ này';
      badgeColor = 'text-cyan-300 bg-cyan-950/60 border-cyan-800/40';
      break;
    }

    case 14: {
      // TDS Calibrated
      category = 'config';
      icon = 'gauge';
      title = `Hiệu chuẩn TDS (${val} ppm)`;
      detail = 'Đã cập nhật hệ số tds_k theo dung dịch chuẩn';
      badgeColor = 'text-violet-300 bg-violet-950/60 border-violet-800/40';
      break;
    }

    case 15: {
      // Water change (drain) started / stopped
      category = 'run';
      icon = 'droplet';
      // val 1 = hen gio / bam tay, 2 = theo TDS (firmware 1.1.0), 0 = dung
      title = val >= 1 ? 'Bắt đầu thay nước (xả)' : 'Dừng thay nước';
      detail =
        val === 2
          ? 'TDS vượt mức trên – tự thay nước'
          : val === 1
          ? src === 0
            ? 'Đến giờ thay nước theo lịch'
            : 'Thay nước ngay theo lệnh'
          : src === 5
          ? 'Xả đủ thời gian cài đặt'
          : src === 4
          ? 'Dừng do lỗi bảo vệ'
          : 'Người dùng dừng / máy tắt';
      badgeColor = 'text-orange-300 bg-orange-950/60 border-orange-800/40';
      break;
    }

    default:
      title = `Sự kiện loại ${type}`;
      detail = `Giá trị: ${val}`;
  }

  return {
    raw,
    timeText,
    dateKey,
    dateHeader,
    title,
    detail,
    sourceText,
    category,
    icon,
    badgeColor,
  };
}

/**
 * Calculates total filter minutes today and over the last 7 days from history events
 */
export function calculateFilterMetrics(history: HistoryEventTuple[]): {
  minutesToday: number;
  minutes7Days: number;
} {
  let minutesToday = 0;
  let minutes7Days = 0;

  const now = new Date();
  const todayKey = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
  const sevenDaysAgoMs = now.getTime() - 7 * 24 * 3600 * 1000;

  for (const [t, type, src, val] of history) {
    if (type === 4 && src !== 3) {                       // Khong tinh luot thay nuoc (src 3) vao thoi gian loc
      // Filter cycle completed, val is duration in seconds
      const durationMins = Math.round(val / 60);

      if (!hasNoClockBit(t)) {
        const eventDate = new Date(t * 1000);
        const eventKey = `${eventDate.getUTCFullYear()}-${(eventDate.getUTCMonth() + 1).toString().padStart(2, '0')}-${eventDate.getUTCDate().toString().padStart(2, '0')}`;

        if (eventKey === todayKey) {
          minutesToday += durationMins;
        }

        if (eventDate.getTime() >= sevenDaysAgoMs) {
          minutes7Days += durationMins;
        }
      } else {
        // Events before clock set count towards today if recent
        minutesToday += durationMins;
        minutes7Days += durationMins;
      }
    }
  }

  return {
    minutesToday,
    minutes7Days,
  };
}
