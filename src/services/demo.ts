/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  DEFAULT_PIN,
  HistoryEventTuple,
  INITIAL_CONFIG,
  INITIAL_STATUS,
  LOCKED_ERRORS_MASK,
  UfConfig,
  UfIncomingPacket,
  UfStatus,
} from '../types/system';
import { isFilterActiveAt } from './scheduleCalculator';

export type PacketCallback = (pkt: UfIncomingPacket) => void;

/**
 * In-browser virtual CITO UF FILTER machine.
 * Follows real schedule matching local PC clock, fluctuates realistic TDS (120-180 ppm),
 * handles commands and sends st / cf / ack / hi packets identically to real firmware 1.0.0.
 */
export class UfDemoDevice {
  private status: UfStatus;
  private config: UfConfig;
  private history: HistoryEventTuple[] = [];
  private onPacket: PacketCallback | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private pin: string = DEFAULT_PIN;
  private authenticated: boolean = false;
  private runRemainingSeconds: number = 0;
  private runTotalSeconds: number = 0;
  private isMeasuring: boolean = false;
  private measureRemainingSeconds: number = 0;
  private uptimeSeconds: number = 3600;
  private isDraining: boolean = false;
  private drainRemainingSeconds: number = 0;
  private drainDoneDay: number = -1;          // Ngay (so ngay tu 1970) da thay nuoc theo lich
  private runElapsedSeconds: number = 0;
  private cleanLearnSeconds: number = 0;      // Sau FILTER_RESET: bom chay du lau thi hoc lai loi sach

  constructor() {
    this.status = JSON.parse(JSON.stringify(INITIAL_STATUS));
    this.config = JSON.parse(JSON.stringify(INITIAL_CONFIG));
    this.initSampleHistory();
  }

  private initSampleHistory() {
    const nowEpoch = Math.floor(Date.now() / 1000 - new Date().getTimezoneOffset() * 60);
    this.history = [
      [nowEpoch - 120, 4, 0, 1800], // Filtered 30 mins by schedule
      [nowEpoch - 3600, 13, 7, 0], // Internet time sync
      [nowEpoch - 3610, 11, 0, 58], // WiFi connected (-58 dBm)
      [nowEpoch - 3660, 1, 1, 0x1021], // Boot: power on v1.0.1
    ];
  }

  public setPacketCallback(cb: PacketCallback | null) {
    this.onPacket = cb;
  }

  public start() {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), 1000);
  }

  public stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private emit(pkt: UfIncomingPacket) {
    if (this.onPacket) {
      this.onPacket(pkt);
    }
  }

  private tick() {
    if (!this.authenticated) return;

    this.uptimeSeconds++;
    this.status.up = this.uptimeSeconds;

    const now = new Date();
    const hasLockFault = (this.status.err & LOCKED_ERRORS_MASK) !== 0;
    const localNow = Math.floor(now.getTime() / 1000 - now.getTimezoneOffset() * 60);
    this.status.d = [this.config.drain, 0, 1, 0];
    this.status.dleft = 0;
    this.updateDrainNext(localNow);
    this.updatePumpRun();

    // Check if machine is turned on
    if (this.status.pw === 0 || hasLockFault) {
      this.status.st = hasLockFault ? 5 : 0;
      this.status.ph = hasLockFault ? 'FAULT' : 'OFF';
      this.status.p = [0, 1, 0];
      this.status.v = [this.config.valve, 0, 1, 0];
      this.status.wt = 0;
      this.status.run = { tot: 0, left: 0 };
      this.status.next = -1;
      this.isDraining = false;
      this.emit({ t: 'st', ...this.status });
      return;
    }

    // Thay nuoc theo lich (giong firmware: ngay tu 1970 chia het d_days, trong 2 phut sau gio hen)
    if (this.config.drain === 1 && !this.isDraining && this.status.tk === 1) {
      const day = Math.floor(localNow / 86400);
      const at = day * 86400 + this.config.d_hour * 3600 + this.config.d_min * 60;
      if (day % Math.max(1, this.config.d_days) === 0 && day !== this.drainDoneDay && localNow >= at && localNow < at + 120) {
        this.drainDoneDay = day;
        this.startDrain(0);
      }
    }

    // Dang thay nuoc: uu tien hon loc
    if (this.isDraining) {
      this.drainRemainingSeconds--;
      this.status.st = 6;
      this.status.ph = 'DRAINING';
      this.status.p = [1, 1, 330];
      this.status.v = [this.config.valve, 0, 1, 0];
      this.status.d = [this.config.drain, 1, 1, 180];
      this.status.wt = 16.1;
      this.status.dleft = Math.max(0, this.drainRemainingSeconds);
      this.status.run = { tot: this.config.d_sec, left: this.status.dleft };
      if (this.drainRemainingSeconds <= 0) {
        this.isDraining = false;
        this.addHistoryEvent(4, 3, this.config.d_sec);   // Luot bom (thay nuoc) xong
        this.addHistoryEvent(15, 5, 0);                  // Xa du thoi gian
      } else {
        this.emit({ t: 'st', ...this.status });
        return;
      }
    }

    // Handle Measuring TDS cycle (25s)
    if (this.isMeasuring) {
      this.measureRemainingSeconds--;
      this.status.st = 4;
      this.status.ph = 'MEASURING';
      this.status.p = [1, 1, 385];
      this.status.v = [this.config.valve, this.config.valve, 1, this.config.valve ? 420 : 0];
      this.status.wt = 18.5;
      this.status.run = { tot: 25, left: Math.max(0, this.measureRemainingSeconds) };

      if (this.measureRemainingSeconds <= 0) {
        this.isMeasuring = false;
        // TDS measurement completed
        const newTds = Math.floor(125 + Math.random() * 25);
        this.status.tds = newTds;
        this.status.tds_age = 0;
        this.status.tds_live = newTds;
        this.addHistoryEvent(4, 2, 25);
      } else {
        this.emit({ t: 'st', ...this.status });
        return;
      }
    }

    // Handle manual filtering
    if (this.status.man === 1) {
      this.runRemainingSeconds--;
      this.status.st = 3;
      this.status.ph = 'MANUAL';
      this.status.p = [1, 1, 395];
      this.status.v = [this.config.valve, this.config.valve, 1, this.config.valve ? 425 : 0];
      this.status.wt = 19.2;
      this.status.run = { tot: this.runTotalSeconds, left: Math.max(0, this.runRemainingSeconds) };

      if (this.status.tds_age !== null) {
        this.status.tds_age++;
      }
      this.status.tds_live = Math.floor(130 + Math.sin(this.uptimeSeconds / 10) * 12);

      if (this.runRemainingSeconds <= 0) {
        this.status.man = 0;
        this.addHistoryEvent(7, 5, 0); // Manual stopped by timeout
        this.addHistoryEvent(4, 1, this.runTotalSeconds); // Pump cycle finished
      }

      this.emit({ t: 'st', ...this.status });
      return;
    }

    // Check automated schedule
    const isScheduledNow = isFilterActiveAt(now, this.config);

    if (isScheduledNow) {
      this.status.st = 2;
      this.status.ph = 'FILTERING';
      this.status.p = [1, 1, 380];
      this.status.v = [this.config.valve, this.config.valve, 1, this.config.valve ? 410 : 0];
      this.status.wt = 18.4;

      // Calculate minutes and seconds left in this scheduled hour
      const totalHourSecs = this.config.fmin * 60;
      const elapsedSecs = now.getMinutes() * 60 + now.getSeconds();
      const leftSecs = Math.max(0, totalHourSecs - elapsedSecs);
      this.status.run = { tot: totalHourSecs, left: leftSecs };

      if (this.status.tds_age !== null) {
        this.status.tds_age++;
      }
      this.status.tds_live = Math.floor(134 + Math.sin(this.uptimeSeconds / 8) * 8);
    } else {
      this.status.st = 1;
      this.status.ph = 'STANDBY';
      this.status.p = [0, 1, 0];
      this.status.v = [this.config.valve, 0, 1, 0];
      this.status.wt = 0;
      this.status.run = { tot: 0, left: 0 };

      if (this.status.tds_age !== null) {
        this.status.tds_age++;
      }
      this.status.tds_live = Math.floor(138 + Math.cos(this.uptimeSeconds / 15) * 5);
    }

    // Calculate seconds to next run
    this.calculateNextRun(now);

    this.emit({ t: 'st', ...this.status });
  }

  private startDrain(src: number) {
    this.isDraining = true;
    this.drainRemainingSeconds = this.config.d_sec;
    this.isMeasuring = false;
    this.addHistoryEvent(15, src, 1);
  }

  // Gio lan thay nuoc ke (gio dia phuong, giay tu 1970), 0 = khong lap van xa / chua co gio
  private updateDrainNext(localNow: number) {
    if (this.config.drain !== 1 || this.status.tk !== 1) {
      this.status.dnext_t = 0;
      return;
    }
    const tod = this.config.d_hour * 3600 + this.config.d_min * 60;
    const n = Math.max(1, this.config.d_days);
    for (let d = Math.floor(localNow / 86400), k = 0; k <= 31; k++, d++) {
      const at = d * 86400 + tod;
      if (at > localNow && d % n === 0 && d !== this.drainDoneDay) {
        this.status.dnext_t = at;
        return;
      }
    }
    this.status.dnext_t = 0;
  }

  // Thoi gian da chay cua luot bom + hoc lai loi sach sau FILTER_RESET (goi moi giay, dung trang thai giay truoc)
  private updatePumpRun() {
    if (this.status.p[0] === 1) {
      this.runElapsedSeconds++;
      this.status.rdur = this.runElapsedSeconds;
      if (this.status.fcl < 0 && this.status.st !== 6 && ++this.cleanLearnSeconds >= 12) {
        this.status.fcl = 100;
        this.status.fcl_ma = this.status.p[2];
      }
    } else {
      this.runElapsedSeconds = 0;
    }
  }

  private calculateNextRun(now: Date) {
    if (this.config.fmode === 0) {
      this.status.next = -1;
      this.status.next_t = 0;
      return;
    }

    // Find next active scheduled hour
    const test = new Date(now.getTime());
    test.setSeconds(0, 0);
    // Step forward hour by hour up to 7 days
    let found = false;
    for (let h = 0; h < 24 * 7; h++) {
      const candidate = new Date(test.getTime() + h * 3600 * 1000);
      candidate.setMinutes(0, 0, 0);

      if (candidate.getTime() <= now.getTime()) {
        // If current minute is already beyond fmin, candidate is this hour which has ended
        if (now.getMinutes() >= this.config.fmin) {
          continue;
        }
      }

      if (isFilterActiveAt(candidate, this.config)) {
        const diffSecs = Math.max(0, Math.floor((candidate.getTime() - now.getTime()) / 1000));
        this.status.next = diffSecs;
        this.status.next_t = Math.floor(candidate.getTime() / 1000 - candidate.getTimezoneOffset() * 60);
        found = true;
        break;
      }
    }

    if (!found) {
      this.status.next = -1;
      this.status.next_t = 0;
    }
  }

  private addHistoryEvent(type: number, src: number, val: number) {
    const nowEpoch = Math.floor(Date.now() / 1000 - new Date().getTimezoneOffset() * 60);
    const ev: HistoryEventTuple = [nowEpoch, type, src, val];
    this.history.unshift(ev);
    if (this.history.length > 100) this.history.pop();
    // Real-time event push to connected app
    this.emit({
      t: 'ev',
      e: [ev],
    });
  }

  /**
   * Handle incoming commands from web app
   */
  public handleCommand(action: string, params: Record<string, unknown> = {}): void {
    if (action === 'AUTH') {
      const enteredPin = String(params.pin ?? '');
      if (enteredPin === this.pin) {
        this.authenticated = true;
        this.emit({ t: 'ack', a: 'AUTH', ok: true, msg: 'Đăng nhập thành công' });
        // After successful AUTH, firmware immediately sends cf, hi and st
        setTimeout(() => {
          this.emit({ t: 'cf', ...this.config });
          this.emit({
            t: 'hi',
            clr: true,
            end: true,
            max: 100,
            e: this.history,
          });
          this.emit({ t: 'st', ...this.status });
        }, 80);
      } else {
        this.emit({ t: 'ack', a: 'AUTH', ok: false, msg: 'Mã PIN không đúng' });
      }
      return;
    }

    if (!this.authenticated) {
      this.emit({ t: 'ack', a: action, ok: false, msg: 'Chưa nhập mã PIN' });
      return;
    }

    switch (action) {
      case 'GET_CONFIG':
        this.emit({ t: 'ack', a: 'GET_CONFIG', ok: true });
        this.emit({ t: 'cf', ...this.config });
        break;

      case 'TIME_SET':
        this.status.tk = 1;
        this.addHistoryEvent(13, 3, 0);
        this.emit({ t: 'ack', a: 'TIME_SET', ok: true, msg: 'Đã cập nhật giờ địa phương' });
        this.emit({ t: 'st', ...this.status });
        break;

      case 'POWER': {
        const on = Boolean(params.on);
        this.status.pw = on ? 1 : 0;
        if (on) {
          // Power on clears locking faults
          this.status.err &= ~LOCKED_ERRORS_MASK;
          this.status.st = 1;
          this.status.ph = 'STANDBY';
        } else {
          this.status.st = 0;
          this.status.ph = 'OFF';
          this.status.man = 0;
          this.isMeasuring = false;
          this.isDraining = false;
        }
        this.addHistoryEvent(2, 3, on ? 1 : 0);
        this.emit({ t: 'ack', a: 'POWER', ok: true, msg: on ? 'Đã bật máy' : 'Đã tắt máy' });
        this.emit({ t: 'st', ...this.status });
        break;
      }

      case 'FILTER': {
        const on = Boolean(params.on);
        if (this.status.pw === 0) {
          this.emit({ t: 'ack', a: 'FILTER', ok: false, msg: 'Máy đang tắt' });
          return;
        }
        if ((this.status.err & LOCKED_ERRORS_MASK) !== 0) {
          this.emit({ t: 'ack', a: 'FILTER', ok: false, msg: 'Máy đang có lỗi khóa an toàn' });
          return;
        }

        if (on) {
          this.status.man = 1;
          this.runTotalSeconds = this.config.man_min * 60;
          this.runRemainingSeconds = this.runTotalSeconds;
          this.addHistoryEvent(7, 3, 1);
          this.emit({ t: 'ack', a: 'FILTER', ok: true, msg: `Bắt đầu lọc tay ${this.config.man_min} phút` });
        } else {
          this.status.man = 0;
          this.addHistoryEvent(7, 3, 0);
          this.emit({ t: 'ack', a: 'FILTER', ok: true, msg: 'Đã dừng lọc tay' });
        }
        this.emit({ t: 'st', ...this.status });
        break;
      }

      case 'MEASURE': {
        if (this.status.pw === 0) {
          this.emit({ t: 'ack', a: 'MEASURE', ok: false, msg: 'Máy đang tắt' });
          return;
        }
        if (this.status.man === 1 || this.status.st === 2) {
          this.emit({ t: 'ack', a: 'MEASURE', ok: false, msg: 'Máy đang lọc, TDS đang tự cập nhật' });
          return;
        }
        if ((this.status.err & LOCKED_ERRORS_MASK) !== 0) {
          this.emit({ t: 'ack', a: 'MEASURE', ok: false, msg: 'Máy đang có lỗi khóa an toàn' });
          return;
        }

        this.isMeasuring = true;
        this.measureRemainingSeconds = 25;
        this.emit({ t: 'ack', a: 'MEASURE', ok: true, msg: 'Đang chạy bơm 25 giây để đo TDS' });
        this.emit({ t: 'st', ...this.status });
        break;
      }

      case 'DRAIN': {
        const on = Boolean(params.on);
        if (!on) {
          if (this.isDraining) {
            this.isDraining = false;
            this.addHistoryEvent(15, 3, 0);
          }
          this.emit({ t: 'ack', a: 'DRAIN', ok: true, msg: 'Đã dừng thay nước' });
          this.emit({ t: 'st', ...this.status });
          break;
        }
        if (this.config.drain !== 1) {
          this.emit({ t: 'ack', a: 'DRAIN', ok: false, msg: 'Chưa bật van xả (thay nước) trong cài đặt' });
          return;
        }
        if (this.status.pw === 0 || (this.status.err & LOCKED_ERRORS_MASK) !== 0) {
          this.emit({ t: 'ack', a: 'DRAIN', ok: false, msg: 'Máy đang tắt / có lỗi khóa' });
          return;
        }
        this.startDrain(3);
        this.emit({ t: 'ack', a: 'DRAIN', ok: true, msg: 'Đang thay nước' });
        this.emit({ t: 'st', ...this.status });
        break;
      }

      case 'FILTER_RESET':
        this.status.fcl = -1;
        this.status.fcl_ma = 0;
        this.cleanLearnSeconds = 0;
        this.emit({ t: 'ack', a: 'FILTER_RESET', ok: true, msg: 'Đã ghi nhận lõi mới - máy học lại ở lượt lọc sau' });
        this.emit({ t: 'st', ...this.status });
        break;

      case 'CLEAR_FAULTS':
        // Clears E1, E2, E5, E6, E11, E12 (mask 0xC33)
        this.status.err &= ~0xc33;
        this.addHistoryEvent(6, 3, 0);
        this.emit({ t: 'ack', a: 'CLEAR_FAULTS', ok: true, msg: 'Đã xóa lỗi' });
        this.emit({ t: 'st', ...this.status });
        break;

      case 'SET': {
        const allowedKeys = Object.keys(this.config);
        let changeCount = 0;
        for (const [key, val] of Object.entries(params)) {
          if (!allowedKeys.includes(key)) {
            this.emit({ t: 'ack', a: 'SET', ok: false, msg: `Khóa lạ "${key}", từ chối cài đặt` });
            return;
          }
        }
        for (const [key, val] of Object.entries(params)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (this.config as any)[key] = val;
          changeCount++;
        }
        this.addHistoryEvent(8, 3, changeCount);
        this.emit({ t: 'ack', a: 'SET', ok: true, msg: 'Đã lưu cài đặt mới' });
        this.emit({ t: 'cf', ...this.config });
        this.emit({ t: 'st', ...this.status });
        break;
      }

      case 'ACS_ZERO':
        if (this.status.p[0] === 1 || this.status.v[1] === 1 || this.status.d[1] === 1) {
          this.emit({ t: 'ack', a: 'ACS_ZERO', ok: false, msg: 'Chờ hết lượt lọc, bơm và van phải tắt' });
          return;
        }
        this.config.z_p = 1.65;
        this.config.z_v = 1.65;
        if (this.config.drain === 1) this.config.z_d = 1.65;
        this.addHistoryEvent(10, 3, 0);
        this.emit({ t: 'ack', a: 'ACS_ZERO', ok: true, msg: 'Đã hiệu chuẩn điểm 0 A thành công' });
        this.emit({ t: 'cf', ...this.config });
        break;

      case 'ACS_CAL': {
        const ch = Number(params.ch);
        const ma = Number(params.ma);
        if (ma < 50) {
          this.emit({ t: 'ack', a: 'ACS_CAL', ok: false, msg: 'Dòng quá nhỏ (< 50 mA), hãy bấm Lọc ngay trước' });
          return;
        }
        if (ch === 0) {
          this.config.k_p = Math.min(207, Math.max(33, Number((82.7 * (ma / 350)).toFixed(1))));
          this.addHistoryEvent(10, 3, 11);
        } else if (ch === 1) {
          this.config.k_v = Math.min(207, Math.max(33, Number((82.7 * (ma / 350)).toFixed(1))));
          this.addHistoryEvent(10, 3, 12);
        } else {
          this.config.k_d = Math.min(207, Math.max(33, Number((82.7 * (ma / 180)).toFixed(1))));
          this.addHistoryEvent(10, 3, 13);
        }
        this.emit({ t: 'ack', a: 'ACS_CAL', ok: true, msg: 'Đã hiệu chuẩn hệ số theo ampe kìm' });
        this.emit({ t: 'cf', ...this.config });
        break;
      }

      case 'TDS_CAL': {
        const ppm = Number(params.ppm);
        if (ppm < 10 || ppm > 2000) {
          this.emit({ t: 'ack', a: 'TDS_CAL', ok: false, msg: 'Giá trị TDS hợp lệ từ 10 đến 2000 ppm' });
          return;
        }
        this.config.tds_k = Number((ppm / 135).toFixed(3));
        this.status.tds = ppm;
        this.addHistoryEvent(14, 3, ppm);
        this.emit({ t: 'ack', a: 'TDS_CAL', ok: true, msg: `Hiệu chuẩn TDS thành công (${ppm} ppm)` });
        this.emit({ t: 'cf', ...this.config });
        this.emit({ t: 'st', ...this.status });
        break;
      }

      case 'DEFAULTS':
        this.config = {
          ...INITIAL_CONFIG,
          ssid: this.config.ssid,
          z_p: this.config.z_p,
          z_v: this.config.z_v,
          k_p: this.config.k_p,
          k_v: this.config.k_v,
          z_d: this.config.z_d,
          k_d: this.config.k_d,
          tds_k: this.config.tds_k,
        };
        this.addHistoryEvent(9, 3, 0);
        this.emit({ t: 'ack', a: 'DEFAULTS', ok: true, msg: 'Đã khôi phục cài đặt mặc định' });
        this.emit({ t: 'cf', ...this.config });
        break;

      case 'REBOOT':
        this.emit({ t: 'ack', a: 'REBOOT', ok: true, msg: 'Đang khởi động lại máy…' });
        setTimeout(() => {
          this.authenticated = false;
          this.uptimeSeconds = 0;
          this.status.up = 0;
          this.status.tk = 0;
          this.addHistoryEvent(1, 3, 0x1021);
        }, 800);
        break;

      case 'WIFI_SET': {
        const ssid = String(params.ssid ?? '');
        this.config.ssid = ssid;
        this.status.wifi = {
          sta: 2,
          ip: '192.168.1.188',
          rssi: -58,
        };
        this.addHistoryEvent(11, 0, 58);
        this.emit({ t: 'ack', a: 'WIFI_SET', ok: true, msg: `Đã kết nối WiFi: ${ssid}` });
        this.emit({ t: 'cf', ...this.config });
        this.emit({ t: 'st', ...this.status });
        break;
      }

      case 'WIFI_CLEAR':
        this.config.ssid = '';
        this.status.wifi = {
          sta: 0,
          ip: '192.168.4.1',
          rssi: 0,
        };
        this.emit({ t: 'ack', a: 'WIFI_CLEAR', ok: true, msg: 'Đã xóa WiFi' });
        this.emit({ t: 'cf', ...this.config });
        this.emit({ t: 'st', ...this.status });
        break;

      case 'WIFI_SCAN':
        this.emit({ t: 'ack', a: 'WIFI_SCAN', ok: true, msg: 'Đang quét sóng WiFi…' });
        setTimeout(() => {
          this.emit({
            t: 'wl',
            n: [
              ['Nha-Toi-5G', -52, 1],
              ['Ho-Ca-Koi-Guest', -65, 0],
              ['CITO-EXTENDER', -72, 1],
              ['Neighbors-WiFi', -85, 1],
            ],
          });
        }, 1200);
        break;

      case 'SET_PIN': {
        const newPin = String(params.pin ?? '');
        if (newPin.length < 4 || newPin.length > 8) {
          this.emit({ t: 'ack', a: 'SET_PIN', ok: false, msg: 'Mã PIN phải từ 4 đến 8 ký tự' });
          return;
        }
        this.pin = newPin;
        this.emit({ t: 'ack', a: 'SET_PIN', ok: true, msg: 'Đã đổi mã PIN mới' });
        break;
      }

      case 'GET_HISTORY':
        this.emit({ t: 'ack', a: 'GET_HISTORY', ok: true });
        this.emit({
          t: 'hi',
          clr: true,
          end: true,
          max: 100,
          e: this.history,
        });
        break;

      case 'CLEAR_HISTORY':
        this.history = [];
        this.emit({ t: 'ack', a: 'CLEAR_HISTORY', ok: true, msg: 'Đã xóa toàn bộ nhật ký' });
        this.emit({
          t: 'hi',
          clr: true,
          end: true,
          max: 100,
          e: [],
        });
        break;

      default:
        this.emit({ t: 'ack', a: action, ok: false, msg: `Lệnh không hợp lệ: ${action}` });
    }
  }

  /**
   * Diagnostic test utility for Demo mode: Inject error codes
   */
  public injectFault(errorCode: number) {
    const bit = errorCode - 1;
    this.status.err |= 1 << bit;

    // Check if warning
    const warnings = [3, 4, 7, 8, 9, 10];
    if (warnings.includes(errorCode)) {
      this.status.wrn |= 1 << bit;
    }

    // If locked fault (E2, E6, E12), change machine state to FAULT
    if (errorCode === 2 || errorCode === 6 || errorCode === 12) {
      this.status.st = 5;
      this.status.ph = 'FAULT';
      this.status.p = [0, 1, 0];
      this.status.v = [this.config.valve, 0, 1, 0];
    }

    this.addHistoryEvent(5, 4, 1 << bit);
    this.emit({ t: 'st', ...this.status });
  }

  public clearAllFaults() {
    this.status.err = 0;
    this.status.wrn = 0;
    if (this.status.st === 5) {
      this.status.st = 1;
      this.status.ph = 'STANDBY';
    }
    this.addHistoryEvent(6, 3, 0);
    this.emit({ t: 'st', ...this.status });
  }
}
