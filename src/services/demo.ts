/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  DEFAULT_PIN,
  drainGapSeconds,
  HistoryEventTuple,
  INITIAL_CONFIG,
  INITIAL_STATUS,
  LOCKED_ERRORS_MASK,
  UfConfig,
  UfIncomingPacket,
  UfStatus,
} from '../types/system';
import { calculateNextScheduledRun, customRunAt, isFilterActiveAt } from './scheduleCalculator';

export type PacketCallback = (pkt: UfIncomingPacket) => void;

/**
 * In-browser virtual CITO UF FILTER machine.
 * Follows real schedule matching local PC clock, fluctuates realistic TDS (120-180 ppm),
 * handles commands and sends st / cf / ack / hi packets like real firmware 1.1.0.
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
  private drainCooldownSeconds: number = 0;   // Xa xong phai nghi moi duoc xa lai: hen gio 1 tieng, theo TDS 2 tieng
  private drainManual: boolean = false;       // Xa tay: khong tu dung, qua d_warn phut -> E14
  private drainElapsedSeconds: number = 0;
  private tdsTries: number = 0;               // Theo TDS: so lan da tu xa lien tiep (5 lan khong giam -> E13)
  private runElapsedSeconds: number = 0;
  private pumpWasOn: boolean = false;
  private avgSum: number = 0;                 // Tong dong bom cac giay da lay mau cua luot dang chay
  private avgCount: number = 0;
  private pumpAlt = { p_min: 80, p_dirty: 800, p_block: 1200 };   // Bo nguong cua loai bom KIA (mac dinh: bom lon)

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

  // Giong settings_validate() cua firmware 1.1.0 (cac muc app chinh duoc)
  private validateConfig() {
    const c = this.config;
    const clamp = (v: number, lo: number, hi: number) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo);
    if (!(c.fmode >= 0 && c.fmode <= 5)) c.fmode = 3;
    c.c_hour = clamp(Math.round(c.c_hour), 0, 23);
    c.c_min = clamp(Math.round(c.c_min), 0, 59);
    c.c_dur = clamp(Math.round(c.c_dur), 1, 1440);
    c.fmin = clamp(Math.round(c.fmin), 5, 60);
    c.day = clamp(Math.round(c.day), 0, 4);
    c.wday = (c.wday & 0x7f) || 0x7f;
    c.man_min = clamp(Math.round(c.man_min), 5, 240);
    c.p_block = clamp(c.p_block, 100, 5000);
    c.p_min = clamp(c.p_min, 0, c.p_block - 50);
    if (c.p_dirty) c.p_dirty = clamp(c.p_dirty, c.p_min + 10, c.p_block - 10);
    c.v_max = clamp(c.v_max, 100, 5000);
    c.v_min = clamp(c.v_min, 0, c.v_max - 50);
    c.d_days = clamp(Math.round(c.d_days), 1, 30);
    c.d_hour = clamp(Math.round(c.d_hour), 0, 23);
    c.d_min = clamp(Math.round(c.d_min), 0, 59);
    c.d_sec = clamp(Math.round(c.d_sec), 5, 1800);
    c.d_vmax = clamp(c.d_vmax, 100, 5000);
    c.d_vmin = clamp(c.d_vmin, 0, c.d_vmax - 50);
    c.d_mode = clamp(Math.round(c.d_mode), 0, 1);
    c.tds_hi = clamp(Math.round(c.tds_hi), 30, 2000);
    c.tds_lo = clamp(Math.round(c.tds_lo), 20, c.tds_hi - 10);
    c.tds_gap = clamp(Math.round(c.tds_gap), 10, 1440);
    c.tds_try = clamp(Math.round(c.tds_try), 1, 20);
    c.d_warn = clamp(Math.round(c.d_warn), 5, 1440);
    c.tds_alarm = clamp(Math.round(c.tds_alarm), 0, 9999);
    c.tds_z = clamp(c.tds_z, 0, 0.3);
    c.tds_int = clamp(Math.round(c.tds_int), 5, 240);
    c.tds_run = clamp(Math.round(c.tds_run), 5, 60);
  }

  // Cong suat uoc tinh = dien ap danh dinh x tong dong (giong firmware)
  private updatePower() {
    const ma = this.status.p[2] + this.status.v[3] + this.status.d[3];
    this.status.wt = Number(((this.status.vn * ma) / 1000).toFixed(1));
  }

  private emit(pkt: UfIncomingPacket) {
    if (pkt.t === 'st') {
      this.updatePower();
      (pkt as { wt: number }).wt = this.status.wt;
    }
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
    if (this.drainCooldownSeconds > 0) this.drainCooldownSeconds--;
    this.status.dcool = this.drainCooldownSeconds;
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
    if (this.config.drain === 1 && !this.isDraining && this.config.d_mode === 1) {
      // Theo TDS: vuot muc tren (va het thoi gian nghi) thi thay nuoc
      // Xa du 5 lan ma TDS van cao -> ngung xa + E13 (giong firmware 1.5.0)
      if (this.status.tds !== null && this.status.tds <= this.config.tds_lo) {
        this.tdsTries = 0;
        this.status.err &= ~0x1000;
        this.status.wrn &= ~0x1000;
      } else if (this.drainCooldownSeconds === 0 && this.status.tds !== null && this.status.tds > this.config.tds_hi) {
        if (this.tdsTries >= this.config.tds_try) {
          this.status.err |= 0x1000;
          this.status.wrn |= 0x1000;
        } else if (!(this.status.err & 0x1000)) {
          this.tdsTries++;
          this.startDrain(0, 2);
        }
      }
      this.status.dtry = this.tdsTries;
    } else if (this.config.drain === 1 && !this.isDraining && this.status.tk === 1) {
      const day = Math.floor(localNow / 86400);
      const at = day * 86400 + this.config.d_hour * 3600 + this.config.d_min * 60;
      if (day % Math.max(1, this.config.d_days) === 0 && day !== this.drainDoneDay && localNow >= at && localNow < at + 120) {
        this.drainDoneDay = day;
        if (this.drainCooldownSeconds === 0) this.startDrain(0); // Con nghi -> bo luot nay (giong firmware)
      }
    }

    // Dang thay nuoc: uu tien hon loc
    if (this.isDraining) {
      this.drainRemainingSeconds--;
      this.drainElapsedSeconds++;
      this.status.st = 6;
      this.status.ph = 'DRAINING';
      this.status.p = [1, 1, 290];
      this.status.v = [this.config.valve, 0, 1, 0];
      this.status.d = [this.config.drain, 1, 1, 180];
      this.status.dleft = Math.max(0, this.drainRemainingSeconds);
      this.status.run = { tot: this.config.d_sec, left: this.status.dleft };
      this.status.dman = this.drainManual ? 1 : 0;
      if (this.drainManual) {
        // Xa tay: chay toi khi nguoi dung dung; dleft = giay con lai toi moc canh bao E14
        const limit = this.config.d_warn * 60;
        this.status.dleft = Math.max(0, limit - this.drainElapsedSeconds);
        this.status.run = { tot: limit, left: this.status.dleft };
        if (this.status.dleft === 0) {
          this.status.err |= 0x2000;
          this.status.wrn |= 0x2000;
        }
        this.emit({ t: 'st', ...this.status });
        return;
      }
      if (this.drainRemainingSeconds <= 0) {
        this.isDraining = false;
        this.drainCooldownSeconds = drainGapSeconds(this.config.d_mode, this.config.tds_gap);
        this.status.dcool = this.drainCooldownSeconds;
        // Thay nuoc xong: TDS giam (de che do theo TDS dung lai khi dat muc duoi)
        if (this.status.tds !== null) this.status.tds = Math.max(90, Math.round(this.status.tds * 0.8));
        this.status.tds_age = 0;
        this.addHistoryEvent(4, 3, this.config.d_sec);   // Luot bom (thay nuoc) xong
        this.addHistoryEvent(15, 5, 0);                  // Xa du thoi gian
      } else {
        this.emit({ t: 'st', ...this.status });
        return;
      }
    }

    // Handle Measuring TDS cycle (bom chay tds_run giay, giong SENS_RUN_MS)
    if (this.isMeasuring) {
      this.measureRemainingSeconds--;
      this.status.st = 4;
      this.status.ph = 'MEASURING';
      this.status.p = [1, 1, 270];
      this.status.v = [this.config.valve, this.config.valve, 1, this.config.valve ? 310 : 0];
      this.status.run = { tot: this.config.tds_run, left: Math.max(0, this.measureRemainingSeconds) };

      if (this.measureRemainingSeconds <= 0) {
        this.isMeasuring = false;
        // TDS measurement completed
        const newTds = Math.floor(125 + Math.random() * 25);
        this.status.tds = newTds;
        this.status.tds_age = 0;
        this.status.tds_live = newTds;
        this.addHistoryEvent(4, 2, this.config.tds_run);
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
      this.status.p = [1, 1, 272 + Math.round(Math.sin(this.uptimeSeconds / 4) * 6)];
      this.status.v = [this.config.valve, this.config.valve, 1, this.config.valve ? 310 : 0];
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
      this.status.p = [1, 1, 268 + Math.round(Math.sin(this.uptimeSeconds / 4) * 6)];
      this.status.v = [this.config.valve, this.config.valve, 1, this.config.valve ? 308 : 0];

      // Calculate minutes and seconds left in this scheduled hour
      // Che do Tu dat: 1 luot dai c_dur phut; cac che do khac: fmin phut dau moi gio
      const cusRun = this.config.fmode === 5 ? customRunAt(now, this.config) : null;
      const totalHourSecs = cusRun ? this.config.c_dur * 60 : this.config.fmin * 60;
      const elapsedSecs = cusRun
        ? Math.floor((now.getTime() - cusRun.start.getTime()) / 1000)
        : now.getMinutes() * 60 + now.getSeconds();
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

  private startDrain(src: number, val: number = 1, manual: boolean = false) {
    this.drainManual = manual;
    this.drainElapsedSeconds = 0;
    this.isDraining = true;
    this.drainRemainingSeconds = this.config.d_sec;
    this.isMeasuring = false;
    this.addHistoryEvent(15, src, val);   // val 1 = hen gio / tay, 2 = theo TDS
  }

  // Gio lan thay nuoc ke (gio dia phuong, giay tu 1970), 0 = khong lap van xa / chua co gio
  private updateDrainNext(localNow: number) {
    if (this.config.drain !== 1 || this.status.tk !== 1 || this.config.d_mode !== 0) {
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

  // Thoi gian da chay cua luot bom + lay mau dong bom de tinh trung binh luot (goi moi giay, dung trang thai giay truoc).
  // Giong firmware 1.2.0: KHONG ket luan loi ban tuc thoi - het luot (bom tat) moi tinh trung binh -> E3 + do sach.
  private updatePumpRun() {
    if (this.status.p[0] === 1) {
      this.pumpWasOn = true;
      this.runElapsedSeconds++;
      this.status.rdur = this.runElapsedSeconds;
      if (this.status.st !== 6 && this.runElapsedSeconds > 10 && this.status.p[2] >= this.config.p_min) {
        this.avgSum += this.status.p[2];
        this.avgCount++;
      }
      return;
    }
    this.runElapsedSeconds = 0;
    if (!this.pumpWasOn) return;
    this.pumpWasOn = false;
    const n = this.avgCount;
    const avg = n ? Math.round(this.avgSum / n) : 0;
    this.avgSum = 0;
    this.avgCount = 0;
    if (!this.config.p_dirty || n < 20) return;           // Luot qua ngan (do TDS) -> giu ket luan cu
    this.status.pavg = avg;
    if (!this.status.fcl_ma || avg + 5 <= this.status.fcl_ma) this.status.fcl_ma = avg;
    const span = this.config.p_dirty - this.status.fcl_ma;
    this.status.fcl = span <= 0 ? 0 : Math.min(100, Math.max(0, Math.round((100 * (this.config.p_dirty - avg)) / span)));
    const hadE3 = (this.status.err & 4) !== 0;
    if (avg > this.config.p_dirty) {
      this.status.err |= 4;
      this.status.wrn |= 4;
      if (!hadE3) this.addHistoryEvent(5, 0, 4);
    } else {
      this.status.err &= ~4;
      this.status.wrn &= ~4;
      if (hadE3) this.addHistoryEvent(6, 0, 4);
    }
  }

  private calculateNextRun(now: Date) {
    if (this.config.fmode === 0) {
      this.status.next = -1;
      this.status.next_t = 0;
      return;
    }

    if (this.config.fmode === 5) {
      const r = calculateNextScheduledRun(now, this.config);
      this.status.next = r ? r.secondsUntil : -1;
      this.status.next_t = r ? Math.floor(r.nextRun.getTime() / 1000 - r.nextRun.getTimezoneOffset() * 60) : 0;
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
        if ((this.status.err & LOCKED_ERRORS_MASK) !== 0 || this.isDraining) {
          this.emit({ t: 'ack', a: 'MEASURE', ok: false, msg: 'Máy đang tắt / có lỗi / đang thay nước - chưa đo được' });
          return;
        }
        if (this.status.man === 1 || this.status.st === 2) {
          const liveTds = Math.floor(125 + Math.random() * 25);
          this.status.tds = liveTds;
          this.status.tds_age = 0;
          this.emit({ t: 'ack', a: 'MEASURE', ok: true, msg: `Đang lọc - số đo cập nhật khi nước chảy đủ ${this.config.tds_run} giây` });
          this.emit({ t: 'st', ...this.status });
          break;
        }

        this.isMeasuring = true;
        this.measureRemainingSeconds = this.config.tds_run;
        this.emit({ t: 'ack', a: 'MEASURE', ok: true, msg: `Đang chạy bơm ${this.config.tds_run} giây để đo TDS + nhiệt độ` });
        this.emit({ t: 'st', ...this.status });
        break;
      }

      case 'DRAIN': {
        const on = Boolean(params.on);
        if (!on) {
          if (this.isDraining) {
            // Giong firmware: dung giua chung cung tinh la vua xa -> phai nghi moi duoc xa lai
            this.isDraining = false;
            this.drainManual = false;
            this.status.dman = 0;
            this.status.dleft = 0;
            this.status.err &= ~0x2000;
            this.status.wrn &= ~0x2000;
            this.drainCooldownSeconds = drainGapSeconds(this.config.d_mode, this.config.tds_gap);
            this.status.dcool = this.drainCooldownSeconds;
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
        if (this.drainCooldownSeconds > 0 && !this.isDraining) {
          this.emit({
            t: 'ack',
            a: 'DRAIN',
            ok: false,
            msg: `Vừa thay nước - chờ thêm ${Math.ceil(this.drainCooldownSeconds / 60)} phút mới thay lại được`,
          });
          return;
        }
        if (!this.isDraining) this.startDrain(3, 1, true);
        this.emit({ t: 'ack', a: 'DRAIN', ok: true, msg: 'Đang thay nước' });
        this.emit({ t: 'st', ...this.status });
        break;
      }

      case 'FILTER_RESET':
        this.status.fcl = -1;
        this.status.fcl_ma = 0;
        this.status.pavg = 0;
        this.status.err &= ~4;
        this.status.wrn &= ~4;
        this.avgSum = 0;
        this.avgCount = 0;
        this.emit({ t: 'ack', a: 'FILTER_RESET', ok: true, msg: 'Đã ghi nhận lõi mới - máy học lại ở lượt lọc sau' });
        this.emit({ t: 'st', ...this.status });
        break;

      case 'CLEAR_FAULTS':
        // Clears E1, E2, E5, E6, E11, E12 (mask 0xC33)
        this.status.err &= ~0x1c33; // + E13
        this.status.wrn &= ~0x1000;
        this.tdsTries = 0;
        this.status.dtry = 0;
        this.addHistoryEvent(6, 3, 0);
        this.emit({ t: 'ack', a: 'CLEAR_FAULTS', ok: true, msg: 'Đã xóa lỗi' });
        this.emit({ t: 'st', ...this.status });
        break;

      case 'SET': {
        const allowedKeys = Object.keys(this.config);
        const entries = Object.entries(params);
        if (entries.length === 0) {
          this.emit({ t: 'ack', a: 'SET', ok: false, msg: 'Không có giá trị nào' });
          return;
        }
        for (const [key] of entries) {
          // Giong firmware: 1 khoa la la tu choi CA lenh
          if (!allowedKeys.includes(key) || ['fw', 'dev', 'ssid', 'rst', 'pend', 'ap'].includes(key)) {
            this.emit({ t: 'ack', a: 'SET', ok: false, msg: 'Khóa cài đặt không hợp lệ' });
            return;
          }
        }
        const oldMode = this.config.fmode;
        // Loai bom truoc (giong firmware): doi cho 2 bo nguong, hoc lai dong loi sach
        if ('ptype' in params) {
          const t = Number(params.ptype) ? 1 : 0;
          if (t !== this.config.ptype) {
            const cur = { p_min: this.config.p_min, p_dirty: this.config.p_dirty, p_block: this.config.p_block };
            Object.assign(this.config, this.pumpAlt);
            this.pumpAlt = cur;
            this.config.ptype = t;
            this.status.fcl = -1;
            this.status.fcl_ma = 0;
            this.status.pavg = 0;
            this.status.err &= ~4;
            this.status.wrn &= ~4;
          }
        }
        for (const [key, val] of entries) {
          if (key === 'ptype') continue;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (this.config as any)[key] = Number(val);
        }
        this.validateConfig();
        // Doi che do loc ma khong gui kem fmin -> phut / gio ve mac dinh cua che do (giong firmware)
        if (this.config.fmode !== oldMode && !('fmin' in params)) {
          this.config.fmin = ({ 1: 20, 2: 30, 3: 30, 4: 10 } as Record<number, number>)[this.config.fmode] ?? this.config.fmin;
        }
        this.addHistoryEvent(8, 3, entries.length);
        this.emit({ t: 'ack', a: 'SET', ok: true, msg: 'Đã lưu' });
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

      case 'TDS_ZERO':
        // Dau do kho: so dang doc thanh 0 ppm. Qua cao (dang ngam nuoc) thi tu choi nhu firmware
        if (this.status.tds_live > 120) {
          this.emit({
            t: 'ack',
            a: 'TDS_ZERO',
            ok: false,
            msg: 'Số đọc quá cao để làm điểm 0 - nhấc đầu dò khỏi nước, lau khô rồi thử lại',
          });
          return;
        }
        this.config.tds_z = Number((this.status.tds_live / 430).toFixed(3));
        this.status.tds_live = 0;
        this.status.tds = 0;
        this.status.tds_age = 0;
        this.addHistoryEvent(14, 3, 0);
        this.emit({ t: 'ack', a: 'TDS_ZERO', ok: true, msg: 'Đã đặt điểm 0 TDS' });
        this.emit({ t: 'cf', ...this.config });
        this.emit({ t: 'st', ...this.status });
        break;

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
          tds_z: this.config.tds_z,
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
