/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Bluetooth Service & Characteristic UUIDs for CITO UF FILTER
export const UF_SERVICE_UUID = '34c64d28-6e88-417b-b471-21ee6ff19aea';
export const UF_STATUS_UUID = '8f8f581b-9100-40e1-a6b5-8541fbc05079';
export const UF_COMMAND_UUID = 'fb754b63-1d33-47d7-ad4c-a7e97f628747';
export const UF_DEVICE_PREFIX = 'CITO-UF-';

export const DEFAULT_PIN = '1234';
export const STORAGE_KEY_PIN = 'cito_uf_pin';
export const STORAGE_KEY_LAST_DEVICE = 'cito_uf_last_device_id';

// Status packet structure from machine: {"t":"st", ...}
export interface UfStatus {
  tds: number | null; // Display TDS in ppm (null if never measured since power on)
  tds_age: number | null; // Seconds since last TDS measurement
  tds_live: number; // Instantaneous TDS reading (ppm)
  w: number | null; // Water temperature in °C (1 decimal, null if sensor fault)
  wt: number; // Total power (W, vn * current)
  vn: number; // Nominal voltage (V)
  kwh: number; // 30-day cumulative energy (kWh, 3 decimals)
  pw: 0 | 1; // 1 = power on, 0 = power off
  fm: number; // Filter mode (0-4)
  st: number; // State: 0 OFF, 1 STANDBY, 2 FILTERING, 3 MANUAL, 4 MEASURING, 5 FAULT, 6 DRAINING (water change)
  ph: string; // Machine display text: OFF, STANDBY, FILTERING, MANUAL, MEASURING, DRAINING, FAULT, OTA
  run: {
    tot: number; // Total seconds for current cycle
    left: number; // Remaining seconds for current cycle
  };
  next: number; // Seconds until next filter cycle (-1 if none)
  next_t: number; // Epoch seconds of next cycle in local time (0 if no clock)
  man: 0 | 1; // 1 = manual filter active
  p: [number, number, number]; // Pump: [on (0/1), has_current_sensor (0/1), current_mA]
  v: [number, number, number, number]; // Valve: [installed/enabled (0/1), on (0/1), has_current_sensor (0/1), current_mA]
  d: [number, number, number, number]; // Drain valve (water change): [installed, open, has_current_sensor, current_mA]
  dleft: number; // Draining: seconds left (0 = not draining)
  dman: number; // 1 = manual water change running: no time limit, dleft = seconds until the E14 warning. Firmware 1.6.0+
  dtry: number; // TDS mode: automatic water changes done in a row while TDS is still above tds_lo (5 -> E13). Firmware 1.5.0+
  dcool: number; // Just drained: seconds left before another water change is allowed (0 = allowed)
  dnext_t: number; // Local epoch of next scheduled water change (0 = no drain valve / no clock / TDS mode)
  fcl: number; // Filter cleanliness 0-100 % from the average pump current of a run, updated when a run ends (-1 = unknown)
  fcl_ma: number; // Learned pump current with a clean filter (mA, 0 = not learned yet)
  pavg: number; // Average pump current of the last judged filter run (mA, 0 = none yet). Firmware 1.2.0+
  rdur: number; // Pump running: seconds of this run; idle: length of the last run
  err: number; // Error bitmask (bit b = E(b+1))
  wrn: number; // Warning bitmask (subset of err, machine continues filtering)
  wifi: {
    sta: number; // 0 not configured, 1 connecting, 2 connected, 3 ssid not found, 4 wrong password
    ip: string;
    rssi: number;
  };
  up: number; // Uptime in seconds
  tk: 0 | 1; // 1 = clock is set, 0 = clock unset
  heap: number; // Free RAM in bytes
  maxblk: number; // Largest RAM block in bytes
}

// Config packet structure from machine: {"t":"cf", ...}
export interface UfConfig {
  fw: string; // Firmware version + build date
  dev: string; // Device ID (WiFi MAC without colons)
  ssid: string; // Home WiFi SSID
  rst: string; // Reset reason (POWERON, SW, PANIC, WDT, BROWNOUT, EXT, ...)
  pend: 0 | 1; // 1 = pending OTA confirmation (60s countdown)
  ap: string; // AP WiFi name for emergency firmware flash
  fmode: number; // 0: Manual, 1: Daytime 8-12 + 14-17, 2: Evening 19-5, 3: Night 23-5 (default), 4: 24/24, 5: Custom (c_hour / c_min / c_dur)
  fmin: number; // Filter duration each hour (5-60 min)
  day: number; // 0: Every day, 1: Even days, 2: Odd days, 3: Every 3 days, 4: By weekday
  wday: number; // Weekday bitmask (bit0=Sun, bit1=Mon ... bit6=Sat)
  man_min: number; // Manual filter run duration in minutes (5-1440 since firmware 1.6.3; older firmware caps at 240)
  c_hour: number; // Custom mode (fmode 5): start hour 0-23. Firmware 1.4.0+
  c_min: number; // Custom mode: start minute 0-59
  c_dur: number; // Custom mode: run length in minutes (1-1440). 0 = firmware older than 1.4.0 (no custom mode)
  valve: 0 | 1; // 1 = valve installed, 0 = no valve
  sens_rt: 0 | 1; // 0 = TDS / temperature sampled every 30 min while water flows, 1 = continuous
  tds_auto: 0 | 1; // Interval mode: machine idle when a sample is due -> run the pump tds_run seconds to measure
  tds_int: number; // Minutes between TDS / temperature samples (5-240, default 30) - Firmware 1.3.0
  tds_run: number; // Seconds of water flow before a sample is taken = pump run for a measurement (5-60, default 10)
  ptype: number; // Pump type: 0 small, 1 large. p_min / p_dirty / p_block are the thresholds of the selected type. Firmware 1.2.0+
  p_min: number; // Pump under-current alarm threshold (mA)
  p_dirty: number; // Dirty filter threshold: average pump current of a whole run above this -> E3 (mA, 0 = off)
  p_block: number; // Pump locked rotor/over-current cutoff threshold (mA)
  v_min: number; // Valve under-current threshold (mA)
  v_max: number; // Valve over-current threshold (mA)
  tds_alarm: number; // TDS alarm threshold in ppm (0 = off)
  tds_k: number; // TDS calibration multiplier (0.1 - 10)
  tds_z: number; // TDS zero point: pin voltage with a dry probe (V, 0 - 0.30). Firmware 1.1.1+, set by TDS_ZERO
  off_t: number; // Temperature offset (-10 to 10 °C)
  z_p: number; // Pump ACS712 zero voltage (V)
  z_v: number; // Valve ACS712 zero voltage (V)
  k_p: number; // Pump ACS712 sensitivity (counts/A)
  k_v: number; // Valve ACS712 sensitivity (counts/A)
  bz_key: 0 | 1; // Key click buzzer
  bz_alarm: 0 | 1; // Fault alarm buzzer
  // Water change (drain) - optional. Absent on older firmware -> treated as not installed
  drain: 0 | 1; // 1 = drain valve installed (GPIO26)
  d_auto: number; // 1 = automatic water change on (timer / TDS), 0 = manual only. -1 = firmware older than 1.6.4 (always on)
  d_mode: number; // 0 = by timer (d_days / d_hour / d_min), 1 = by TDS (tds_hi / tds_lo)
  tds_hi: number; // TDS mode: above this -> change water (ppm)
  tds_lo: number; // TDS mode: keep changing until TDS <= this (ppm)
  tds_try: number; // TDS mode: automatic water changes in a row before giving up with E13 (1-20, default 5). 0 = firmware older than 1.5.1 (fixed 5)
  tds_gap: number; // TDS mode: minutes between two water changes (10-1440, default 60 since firmware 1.6.1). 0 = firmware older than 1.5.0 (fixed 2 hours)
  d_days: number; // Change water every N days (1-30; epoch day % N == 0)
  d_hour: number; // Hour (0-23)
  d_min: number; // Minute (0-59)
  d_sec: number; // Drain duration in seconds (5-1800) - automatic water changes only since firmware 1.6.0
  d_warn: number; // Manual water change running longer than this many minutes -> E14 warning (5-1440, default 60). 0 = firmware older than 1.6.0 (manual change also stops after d_sec)
  d_vmin: number; // Drain valve under-current threshold (mA) -> E11
  d_vmax: number; // Drain valve over-current threshold (mA) -> E12 (locked)
  z_d: number; // Drain ACS712 zero voltage (V)
  k_d: number; // Drain ACS712 sensitivity (counts/A)
}

// Ack packet: {"t":"ack", "a":"<CMD>", "ok": boolean, "msg"?: string}
export interface UfAckPacket {
  t: 'ack';
  a: string;
  ok: boolean;
  msg?: string;
}

// History event tuple: [t, type, src, val]
export type HistoryEventTuple = [number, number, number, number];

// History response packet: {"t":"hi", "clr": bool, "end": bool, "max": 100, "e": [...]}
export interface UfHistoryPacket {
  t: 'hi';
  clr: boolean;
  end: boolean;
  max: number;
  e: HistoryEventTuple[];
}

// Real-time event push: {"t":"ev", "e": [...]}
export interface UfRealtimeEventPacket {
  t: 'ev';
  e: HistoryEventTuple[];
}

// WiFi scan result: {"t":"wl", "n": [["SSID", dBm, enc], ...], "err"?: string}
export interface UfWifiScanPacket {
  t: 'wl';
  n: [string, number, number][];
  err?: string;
}

// Union of all incoming packets
export type UfIncomingPacket =
  | ({ t: 'st' } & UfStatus)
  | ({ t: 'cf' } & UfConfig)
  | UfAckPacket
  | UfHistoryPacket
  | UfRealtimeEventPacket
  | UfWifiScanPacket;

// Error definition table matching firmware 1.1.0
export interface ErrorDetail {
  code: string;
  bit: number;
  name: string;
  isLocking: boolean;
  isWarning: boolean;
  hint: string;
}

export const ERROR_DEFINITIONS: Record<number, ErrorDetail> = {
  1: {
    code: 'E1',
    bit: 0,
    name: 'Bơm không chạy (không có dòng)',
    isLocking: false,
    isWarning: false,
    hint: 'Dừng lượt này, giờ sau tự thử lại. Kiểm tra dây bơm, cầu chì, bơm kẹt rác hoặc hồ cạn nước.',
  },
  2: {
    code: 'E2',
    bit: 1,
    name: 'Bơm quá dòng / ngắn mạch',
    isLocking: true,
    isWarning: false,
    hint: 'Máy đã khóa an toàn! Bơm kẹt cánh hoặc chập dây. Vui lòng kiểm tra kỹ bơm trước khi bấm "Xóa lỗi".',
  },
  3: {
    code: 'E3',
    bit: 2,
    name: 'Lõi lọc bẩn (dòng bơm tăng)',
    isLocking: false,
    isWarning: true,
    hint: 'Cảnh báo: Máy vẫn tiếp tục lọc. Dòng bơm trung bình của lượt lọc vừa rồi cao hơn mức lõi bẩn. Nên súc rửa hoặc thay lõi lọc UF sớm; lượt sau dòng trung bình thấp lại thì cảnh báo tự hết.',
  },
  4: {
    code: 'E4',
    bit: 3,
    name: 'MOSFET bơm kẹt (tắt vẫn có dòng)',
    isLocking: false,
    isWarning: true,
    hint: 'Cảnh báo: Mạch công suất hỏng, bơm có thể đang chạy liên tục. Vui lòng báo thợ kỹ thuật.',
  },
  5: {
    code: 'E5',
    bit: 4,
    name: 'Van lọc không mở',
    isLocking: false,
    isWarning: false,
    hint: 'Dừng lượt này, giờ sau thử lại. Kiểm tra dây van điện từ. Nếu hồ không dùng van, hãy tắt mục "Có van lọc" trong tab Kỹ thuật.',
  },
  6: {
    code: 'E6',
    bit: 5,
    name: 'Van quá dòng / chập van',
    isLocking: true,
    isWarning: false,
    hint: 'Máy đã khóa an toàn! Cuộn hút van chập hoặc kẹt cơ khí. Kiểm tra van trước khi xóa lỗi.',
  },
  7: {
    code: 'E7',
    bit: 6,
    name: 'Mất cảm biến dòng ACS712',
    isLocking: false,
    isWarning: true,
    hint: 'Cảnh báo: Bơm vẫn chạy nhưng mất chức năng bảo vệ dòng. Kiểm tra giắc cắm cảm biến dòng.',
  },
  8: {
    code: 'E8',
    bit: 7,
    name: 'Mất cảm biến nhiệt DS18B20',
    isLocking: false,
    isWarning: true,
    hint: 'Cảnh báo: Máy vẫn lọc bình thường, nhưng TDS sẽ không được bù nhiệt độ tự động. Kiểm tra dây đầu dò.',
  },
  9: {
    code: 'E9',
    bit: 8,
    name: 'Máy chưa có giờ chuẩn',
    isLocking: false,
    isWarning: true,
    hint: 'Máy lọc theo thời gian chạy tạm thời. Bấm nút "Gửi giờ điện thoại" hoặc cài WiFi nhà để lấy giờ Internet.',
  },
  10: {
    code: 'E10',
    bit: 9,
    name: 'TDS cao hơn ngưỡng cảnh báo',
    isLocking: false,
    isWarning: true,
    hint: 'Cảnh báo: Nước hồ có TDS vượt mức an toàn. Nên kiểm tra chất lượng nước, châm nước sạch hoặc thay lõi lọc.',
  },
  11: {
    code: 'E11',
    bit: 10,
    name: 'Van xả không mở',
    isLocking: false,
    isWarning: false,
    hint: 'Đã hủy lần thay nước này (lịch lần sau vẫn chạy). Kiểm tra dây van xả. Nếu không lắp van xả, hãy tắt mục "Có lắp van xả" trong tab Kỹ thuật.',
  },
  12: {
    code: 'E12',
    bit: 11,
    name: 'Van xả quá dòng / chập',
    isLocking: true,
    isWarning: false,
    hint: 'Máy đã khóa an toàn! Cuộn van xả chập hoặc kẹt. Kiểm tra van xả trước khi bấm "Xóa lỗi".',
  },
  14: {
    code: 'E14',
    bit: 13,
    name: 'Xả tay quá lâu',
    isLocking: false,
    isWarning: true,
    hint: 'Máy đang xả tay liên tục lâu hơn thời gian cảnh báo đã cài (tab Lịch, mặc định 1 tiếng) và VẪN ĐANG XẢ. Bấm "Dừng xả" nếu đã đủ, kẻo hồ cạn nước. Dừng xả thì cảnh báo tự hết.',
  },
  13: {
    code: 'E13',
    bit: 12,
    name: 'Thay nước nhiều lần mà TDS không giảm',
    isLocking: false,
    isWarning: true,
    hint: 'Máy đã ngừng tự xả theo TDS (vẫn lọc bình thường). Kiểm tra nguồn nước cấp, van xả, đầu dò TDS hoặc mức TDS dưới đặt quá thấp. Máy đã xả đủ số lần cài ở tab Lịch (mặc định 5) mà TDS không giảm. Bấm "Xóa lỗi" để máy thử xả lại từ đầu; TDS xuống tới mức dưới thì cảnh báo tự hết.',
  },
};

// 2 loai bom va nguong dong mac dinh cua firmware (config.h: DEF_PUMP_xxx / DEF_PUMP_L_xxx)
export const PUMP_TYPES: { id: number; name: string; p_min: number; p_dirty: number; p_block: number }[] = [
  { id: 0, name: 'Bơm nhỏ', p_min: 40, p_dirty: 750, p_block: 1200 },
  { id: 1, name: 'Bơm lớn', p_min: 80, p_dirty: 800, p_block: 1200 },
];

// Filter mode names and descriptions
export const FILTER_MODES: { id: number; name: string; hours: string; icon: string; desc: string }[] = [
  { id: 0, name: 'Thủ công', hours: 'Chỉ lọc khi bấm nút', icon: 'hand', desc: 'Không tự động theo giờ, chỉ chạy khi bấm "Lọc ngay"' },
  { id: 1, name: 'Ban ngày', hours: '08–12h · 14–17h', icon: 'sun', desc: 'Lọc ban ngày, nghỉ trưa 12:00 – 14:00' },
  { id: 2, name: 'Buổi tối', hours: '19:00 – 05:00', icon: 'moon-night', desc: 'Lọc từ tối tới sáng sớm, qua nửa đêm' },
  { id: 3, name: 'Ban đêm', hours: '23:00 – 05:00', icon: 'moon', desc: 'Khung giờ yên tĩnh ban đêm (chế độ khuyên dùng mặc định)' },
  { id: 4, name: 'Cả ngày', hours: '24/24', icon: 'repeat', desc: 'Giờ nào trong ngày cũng lọc' },
  { id: 5, name: 'Tự đặt', hours: 'Giờ + số phút tự nhập', icon: 'custom', desc: 'Ngày được lọc: chạy một lượt từ giờ bạn nhập, trong số phút bạn nhập' },
];

export const DAY_OPTIONS: { id: number; name: string; desc: string }[] = [
  { id: 0, name: 'Mỗi ngày', desc: 'Lọc đều đặn tất cả các ngày trong tuần' },
  { id: 1, name: 'Ngày chẵn', desc: 'Lọc vào ngày 2, 4, 6, 8, 10... trong tháng' },
  { id: 2, name: 'Ngày lẻ', desc: 'Lọc vào ngày 1, 3, 5, 7, 9... trong tháng' },
  { id: 3, name: 'Ba ngày 1 lần', desc: 'Theo ngày trong năm: 1/1, 4/1, 7/1… (đếm liên tục, không reset theo tháng)' },
  { id: 4, name: 'Theo thứ', desc: 'Chọn các thứ cụ thể trong tuần (T2 - CN)' },
];

export const WEEKDAYS = [
  { bit: 0, label: 'CN', full: 'Chủ nhật' },
  { bit: 1, label: 'T2', full: 'Thứ hai' },
  { bit: 2, label: 'T3', full: 'Thứ ba' },
  { bit: 3, label: 'T4', full: 'Thứ tư' },
  { bit: 4, label: 'T5', full: 'Thứ năm' },
  { bit: 5, label: 'T6', full: 'Thứ sáu' },
  { bit: 6, label: 'T7', full: 'Thứ bảy' },
];

export const MACHINE_STATES: Record<number, { name: string; color: string; badge: string }> = {
  0: { name: 'Đã tắt', color: 'text-slate-400', badge: 'bg-slate-800 text-slate-300 border-slate-700' },
  1: { name: 'Đang nghỉ – chờ lượt tới', color: 'text-emerald-400', badge: 'bg-emerald-950/60 text-emerald-300 border-emerald-800/50' },
  2: { name: 'Đang lọc theo lịch', color: 'text-cyan-400', badge: 'bg-cyan-950/60 text-cyan-300 border-cyan-800/50' },
  3: { name: 'Đang lọc tay', color: 'text-blue-400', badge: 'bg-blue-950/60 text-blue-300 border-blue-800/50' },
  4: { name: 'Đang đo TDS', color: 'text-purple-400', badge: 'bg-purple-950/60 text-purple-300 border-purple-800/50' },
  5: { name: 'LỖI – Đã khóa an toàn', color: 'text-rose-400', badge: 'bg-rose-950/60 text-rose-300 border-rose-800/50' },
  6: { name: 'Đang thay nước (xả)', color: 'text-orange-400', badge: 'bg-orange-950/60 text-orange-300 border-orange-800/50' },
};

/** Locked faults (E2, E6, E12): power on again or CLEAR_FAULTS */
export const LOCKED_ERRORS_MASK = 0x822;
/** Number of error codes known by the firmware (E1..E14) */
export const ERROR_COUNT = 14;

/**
 * Format current: mA under 1000, A with 2 decimals >= 1000
 */
export function formatCurrent(mA: number): string {
  if (mA < 0) mA = 0;
  if (mA < 1000) {
    return `${Math.round(mA)} mA`;
  }
  return `${(mA / 1000).toFixed(2)} A`;
}

/** Danh gia dong dien 1 thiet bi so voi nguong bao ve cua firmware (de hien chu de hieu cho khach) */
export type CurrentLevel = 'idle' | 'nosensor' | 'low' | 'ok' | 'high' | 'over' | 'stuck';

export interface CurrentAssessment {
  level: CurrentLevel;
  label: string; // Chu ngan hien canh so mA
  tone: 'slate' | 'emerald' | 'amber' | 'rose';
}

/**
 * @param on        thiet bi dang duoc bat
 * @param hasSensor firmware thay cam bien ACS712 cua kenh nay
 * @param mA        dong do duoc
 * @param min       duoi muc nay khi dang bat = khong chay / dut day (E1 / E5 / E11)
 * @param max       tren muc nay = qua dong, may khoa (E2 / E6 / E12)
 * @param warn      (chi bom) tren muc nay = loi loc ban (E3), 0 = tat canh bao
 */
export function assessCurrent(
  on: boolean,
  hasSensor: boolean,
  mA: number,
  min: number,
  max: number,
  warn = 0
): CurrentAssessment {
  if (!hasSensor) return { level: 'nosensor', label: 'Không thấy cảm biến dòng', tone: 'amber' };
  if (!on) {
    // Giong firmware (E4): da tat ma van an dong > 200 mA va > nguong min
    if (mA > 200 && mA > min) return { level: 'stuck', label: 'Đã tắt mà vẫn có dòng', tone: 'amber' };
    return { level: 'idle', label: 'Đang nghỉ', tone: 'slate' };
  }
  if (mA > max) return { level: 'over', label: 'Quá dòng', tone: 'rose' };
  if (mA < min) return { level: 'low', label: 'Dòng quá thấp', tone: 'rose' };
  if (warn > 0 && mA > warn) return { level: 'high', label: 'Cao hơn mức lõi bẩn', tone: 'amber' };
  return { level: 'ok', label: 'Bình thường', tone: 'emerald' };
}

// "08:05" tu gio + phut
export function formatHm(hour: number, minute: number): string {
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

// So lan tu xa lien tiep toi da o che do theo TDS: tds_try (may cu hon 1.5.1: co dinh 5)
export const TDS_DRAIN_MAX_TRIES = 5;
export function tdsMaxTries(c: Pick<UfConfig, 'tds_try'> | null | undefined): number {
  return c && c.tds_try > 0 ? c.tds_try : TDS_DRAIN_MAX_TRIES;
}

// Khoang nghi giua 2 lan thay nuoc (giay): hen gio 1 tieng; theo TDS = tds_gap phut (may cu hon 1.5.0: 2 tieng)
export function drainGapSeconds(dMode: number | undefined, tdsGapMin?: number): number {
  if (dMode !== 1) return 3600;
  return (tdsGapMin && tdsGapMin > 0 ? tdsGapMin : 120) * 60;
}

// TDS / nhiet do dang cap nhat lien tuc: nguoi dung bat, hoac Firmware 1.5.0 tu ep khi thay nuoc theo TDS
export function isSensorRealtime(
  c: (Pick<UfConfig, 'sens_rt' | 'drain' | 'd_mode' | 'tds_gap'> & { d_auto?: number }) | null | undefined
): boolean {
  if (!c) return false;
  return c.sens_rt === 1 || (c.drain === 1 && c.d_auto !== 0 && c.d_mode === 1 && c.tds_gap > 0);
}

// So phut -> "30 phút", "1 tiếng", "1 tiếng 30 phút"
export function formatMinutes(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} phút`;
  return m % 60 === 0 ? `${m / 60} tiếng` : `${Math.floor(m / 60)} tiếng ${m % 60} phút`;
}

/**
 * Format duration in seconds to "HH:MM:SS" or "MM:SS"
 */
export function formatDuration(seconds: number): string {
  if (seconds < 0) return '—';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) {
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format TDS age into Vietnamese relative string
 */
export function formatTdsAge(ageSeconds: number | null): string {
  if (ageSeconds === null || ageSeconds === undefined || ageSeconds < 0) {
    return 'Chưa đo';
  }
  if (ageSeconds < 60) {
    return 'Vừa đo tức thì';
  }
  const mins = Math.floor(ageSeconds / 60);
  if (mins < 60) {
    return `Đo cách đây ${mins} phút`;
  }
  const hours = Math.floor(mins / 60);
  return `Đo cách đây ${hours} giờ`;
}

/**
 * Check if error bitmask has any locked fault (E2, E6 or E12, bitmask 0x822)
 */
export function isLockedFault(errMask: number): boolean {
  return (errMask & LOCKED_ERRORS_MASK) !== 0;
}

/** "HH:MM" of a local epoch (read with getUTC*) */
export function formatLocalHm(localEpoch: number): string {
  const d = new Date(localEpoch * 1000);
  return `${d.getUTCHours().toString().padStart(2, '0')}:${d.getUTCMinutes().toString().padStart(2, '0')}`;
}

/**
 * Extract active errors from bitmask
 */
export function parseErrors(errMask: number, wrnMask: number): ErrorDetail[] {
  const list: ErrorDetail[] = [];
  for (let b = 0; b < ERROR_COUNT; b++) {
    if ((errMask & (1 << b)) !== 0) {
      const codeNum = b + 1;
      const def = ERROR_DEFINITIONS[codeNum];
      if (def) {
        const isWarning = (wrnMask & (1 << b)) !== 0;
        list.push({
          ...def,
          isWarning,
        });
      }
    }
  }
  return list;
}

/**
 * Default mock initial state
 */
export const INITIAL_STATUS: UfStatus = {
  tds: 135,
  tds_age: 180,
  tds_live: 138,
  w: 27.5,
  wt: 0,
  vn: 12,
  kwh: 0.128,
  pw: 1,
  fm: 3,
  st: 1,
  ph: 'STANDBY',
  run: { tot: 0, left: 0 },
  next: 1800,
  next_t: 0,
  man: 0,
  p: [0, 1, 0],
  v: [0, 0, 0, 0],
  d: [0, 0, 0, 0],
  dleft: 0,
  dman: 0,
  dtry: 0,
  dcool: 0,
  dnext_t: 0,
  fcl: 92,
  fcl_ma: 260,
  pavg: 268,
  rdur: 0,
  err: 0,
  wrn: 0,
  wifi: { sta: 2, ip: '192.168.1.155', rssi: -62 },
  up: 3600,
  tk: 1,
  heap: 184500,
  maxblk: 112000,
};

export const INITIAL_CONFIG: UfConfig = {
  fw: '1.1.0 (Nov 1 2026)',
  dev: 'A4CF1289',
  ssid: 'Nha-Toi-5G',
  rst: 'POWERON',
  pend: 0,
  ap: 'CITO UF FILTER',
  fmode: 3,
  fmin: 30,
  day: 0,
  wday: 127,
  man_min: 30,
  c_hour: 8,
  c_min: 0,
  c_dur: 60,
  valve: 0,
  sens_rt: 0,
  tds_auto: 1,
  tds_int: 30,
  tds_run: 10,
  ptype: 0,
  p_min: 40,
  p_dirty: 750,
  p_block: 1200,
  v_min: 50,
  v_max: 1000,
  tds_alarm: 300,
  tds_k: 1.0,
  tds_z: 0,
  off_t: 0.0,
  z_p: 1.65,
  z_v: 1.65,
  k_p: 82.7,
  k_v: 82.7,
  bz_key: 1,
  bz_alarm: 1,
  drain: 1,
  d_auto: 1,
  d_mode: 0,
  tds_hi: 250,
  tds_lo: 150,
  tds_try: 5,
  tds_gap: 60,
  d_days: 3,
  d_hour: 12,
  d_min: 0,
  d_sec: 60,
  d_warn: 60,
  d_vmin: 50,
  d_vmax: 1000,
  z_d: 1.667,
  k_d: 82.7,
};
