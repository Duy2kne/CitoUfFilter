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
  fm: number; // Filter mode (0-5)
  st: number; // State: 0 OFF, 1 STANDBY, 2 FILTERING, 3 MANUAL, 4 MEASURING, 5 FAULT
  ph: string; // Machine display text: OFF, STANDBY, FILTERING, MANUAL, MEASURING, FAULT, OTA
  run: {
    tot: number; // Total seconds for current cycle
    left: number; // Remaining seconds for current cycle
  };
  next: number; // Seconds until next filter cycle (-1 if none)
  next_t: number; // Epoch seconds of next cycle in local time (0 if no clock)
  man: 0 | 1; // 1 = manual filter active
  p: [number, number, number]; // Pump: [on (0/1), has_current_sensor (0/1), current_mA]
  v: [number, number, number, number]; // Valve: [installed/enabled (0/1), on (0/1), has_current_sensor (0/1), current_mA]
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
  fmode: number; // 0: Manual, 1: Daytime, 2: Evening, 3: Night (default), 4: 24/24, 5: Custom
  fmin: number; // Filter duration each hour (5-60 min)
  day: number; // 0: Every day, 1: Even days, 2: Odd days, 3: Every 3 days, 4: By weekday
  wday: number; // Weekday bitmask (bit0=Sun, bit1=Mon ... bit6=Sat)
  win_s: number; // Custom window start hour (0-23)
  win_e: number; // Custom window end hour (0-23)
  man_min: number; // Manual filter run duration in minutes (5-240)
  valve: 0 | 1; // 1 = valve installed, 0 = no valve
  tds_auto: 0 | 1; // 1 = auto run 25s after 1h idle to measure TDS
  p_min: number; // Pump under-current alarm threshold (mA)
  p_dirty: number; // Pump dirty filter warning threshold (mA, 0 = off)
  p_block: number; // Pump locked rotor/over-current cutoff threshold (mA)
  v_min: number; // Valve under-current threshold (mA)
  v_max: number; // Valve over-current threshold (mA)
  tds_alarm: number; // TDS alarm threshold in ppm (0 = off)
  tds_k: number; // TDS calibration multiplier (0.1 - 10)
  off_t: number; // Temperature offset (-10 to 10 °C)
  z_p: number; // Pump ACS712 zero voltage (V)
  z_v: number; // Valve ACS712 zero voltage (V)
  k_p: number; // Pump ACS712 sensitivity (counts/A)
  k_v: number; // Valve ACS712 sensitivity (counts/A)
  bz_key: 0 | 1; // Key click buzzer
  bz_alarm: 0 | 1; // Fault alarm buzzer
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

// Error definition table matching firmware 1.0.0
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
    hint: 'Cảnh báo: Máy vẫn tiếp tục lọc. Nên vệ sinh súc rửa hoặc thay lõi lọc UF sớm.',
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
};

// Filter mode names and descriptions
export const FILTER_MODES: { id: number; name: string; hours: string; icon: string; desc: string }[] = [
  { id: 0, name: 'Thủ công', hours: 'Chỉ lọc khi bấm nút', icon: 'hand', desc: 'Không tự động theo giờ, chỉ chạy khi bấm "Lọc ngay"' },
  { id: 1, name: 'Ban ngày', hours: '08:00 – 17:00', icon: 'sun', desc: 'Mỗi giờ lọc fmin phút trong khung giờ ban ngày' },
  { id: 2, name: 'Buổi tối', hours: '19:00 – 05:00', icon: 'moon-night', desc: 'Lọc vào ban đêm và sáng sớm, qua nửa đêm' },
  { id: 3, name: 'Ban đêm', hours: '23:00 – 05:00', icon: 'moon', desc: 'Khung giờ yên tĩnh ban đêm (chế độ khuyên dùng mặc định)' },
  { id: 4, name: 'Cả ngày', hours: '24/24', icon: 'repeat', desc: 'Mỗi giờ trong ngày đều lọc fmin phút' },
  { id: 5, name: 'Tùy chỉnh', hours: 'Theo giờ cài đặt', icon: 'clock', desc: 'Tự chọn giờ bắt đầu và giờ kết thúc trong ngày' },
];

export const DAY_OPTIONS: { id: number; name: string; desc: string }[] = [
  { id: 0, name: 'Mỗi ngày', desc: 'Lọc đều đặn tất cả các ngày trong tuần' },
  { id: 1, name: 'Ngày chẵn', desc: 'Lọc vào ngày 2, 4, 6, 8, 10... trong tháng' },
  { id: 2, name: 'Ngày lẻ', desc: 'Lọc vào ngày 1, 3, 5, 7, 9... trong tháng' },
  { id: 3, name: 'Ba ngày 1 lần', desc: 'Lọc ngày 1, 4, 7, 10, 13... trong tháng' },
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
};

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
 * Check if error bitmask has any locked fault (E2 or E6, bitmask 0x22)
 */
export function isLockedFault(errMask: number): boolean {
  return (errMask & 0x22) !== 0;
}

/**
 * Extract active errors from bitmask
 */
export function parseErrors(errMask: number, wrnMask: number): ErrorDetail[] {
  const list: ErrorDetail[] = [];
  for (let b = 0; b < 10; b++) {
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
  wt: 14.2,
  vn: 24,
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
  err: 0,
  wrn: 0,
  wifi: { sta: 2, ip: '192.168.1.155', rssi: -62 },
  up: 3600,
  tk: 1,
  heap: 184500,
  maxblk: 112000,
};

export const INITIAL_CONFIG: UfConfig = {
  fw: '1.0.0 (Nov 1 2026)',
  dev: 'A4CF1289',
  ssid: 'Nha-Toi-5G',
  rst: 'POWERON',
  pend: 0,
  ap: 'CITO-UF-A4CF1289',
  fmode: 3,
  fmin: 30,
  day: 0,
  wday: 127,
  win_s: 23,
  win_e: 5,
  man_min: 30,
  valve: 0,
  tds_auto: 1,
  p_min: 150,
  p_dirty: 900,
  p_block: 1500,
  v_min: 80,
  v_max: 800,
  tds_alarm: 300,
  tds_k: 1.0,
  off_t: 0.0,
  z_p: 1.65,
  z_v: 1.65,
  k_p: 82.7,
  k_v: 82.7,
  bz_key: 1,
  bz_alarm: 1,
};
