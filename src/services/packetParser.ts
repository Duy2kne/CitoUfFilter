/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  HistoryEventTuple,
  UfAckPacket,
  UfConfig,
  UfHistoryPacket,
  UfIncomingPacket,
  UfRealtimeEventPacket,
  UfStatus,
  UfWifiScanPacket,
} from '../types/system';

export interface AppState {
  status: UfStatus | null;
  config: UfConfig | null;
  history: HistoryEventTuple[];
  wifiList: [string, number, number][];
  wifiScanError?: string;
  lastAck: UfAckPacket | null;
}

export const INITIAL_APP_STATE: AppState = {
  status: null,
  config: null,
  history: [],
  wifiList: [],
  wifiScanError: undefined,
  lastAck: null,
};

/**
 * Pure state reducer applying incoming JSON packets
 */
export function applyPacket(prev: AppState, pkt: UfIncomingPacket): AppState {
  if (!pkt || typeof pkt !== 'object' || !('t' in pkt)) {
    return prev;
  }

  switch (pkt.t) {
    case 'st': {
      const stPkt = pkt as { t: 'st' } & UfStatus;
      // Copy all status fields, properly respecting null values for tds and w
      const newStatus: UfStatus = {
        tds: stPkt.tds === null || stPkt.tds === undefined ? null : Number(stPkt.tds),
        tds_age: stPkt.tds_age === null || stPkt.tds_age === undefined ? null : Number(stPkt.tds_age),
        tds_live: Number(stPkt.tds_live ?? 0),
        w: stPkt.w === null || stPkt.w === undefined ? null : Number(stPkt.w),
        wt: Number(stPkt.wt ?? 0),
        vn: Number(stPkt.vn ?? 12),
        kwh: Number(stPkt.kwh ?? 0),
        pw: (stPkt.pw ?? 0) as 0 | 1,
        fm: Number(stPkt.fm ?? 0),
        st: Number(stPkt.st ?? 0),
        ph: String(stPkt.ph ?? ''),
        run: {
          tot: Number(stPkt.run?.tot ?? 0),
          left: Number(stPkt.run?.left ?? 0),
        },
        next: Number(stPkt.next ?? -1),
        next_t: Number(stPkt.next_t ?? 0),
        man: (stPkt.man ?? 0) as 0 | 1,
        p: [
          Number(stPkt.p?.[0] ?? 0),
          Number(stPkt.p?.[1] ?? 0),
          Number(stPkt.p?.[2] ?? 0),
        ],
        v: [
          Number(stPkt.v?.[0] ?? 0),
          Number(stPkt.v?.[1] ?? 0),
          Number(stPkt.v?.[2] ?? 0),
          Number(stPkt.v?.[3] ?? 0),
        ],
        // Thay nuoc + do sach loi (firmware cu khong gui -> coi nhu khong lap van xa / chua biet)
        d: [
          Number(stPkt.d?.[0] ?? 0),
          Number(stPkt.d?.[1] ?? 0),
          Number(stPkt.d?.[2] ?? 0),
          Number(stPkt.d?.[3] ?? 0),
        ],
        dleft: Number(stPkt.dleft ?? 0),
        dman: Number(stPkt.dman ?? 0),
        dtry: Number(stPkt.dtry ?? 0),
        dcool: Number(stPkt.dcool ?? 0),
        dnext_t: Number(stPkt.dnext_t ?? 0),
        fcl: Number(stPkt.fcl ?? -1),
        fcl_ma: Number(stPkt.fcl_ma ?? 0),
        pavg: Number(stPkt.pavg ?? 0),
        rdur: Number(stPkt.rdur ?? 0),
        err: Number(stPkt.err ?? 0),
        wrn: Number(stPkt.wrn ?? 0),
        wifi: {
          sta: Number(stPkt.wifi?.sta ?? 0),
          ip: String(stPkt.wifi?.ip ?? ''),
          rssi: Number(stPkt.wifi?.rssi ?? 0),
        },
        up: Number(stPkt.up ?? 0),
        tk: (stPkt.tk ?? 0) as 0 | 1,
        heap: Number(stPkt.heap ?? 0),
        maxblk: Number(stPkt.maxblk ?? 0),
      };

      return {
        ...prev,
        status: newStatus,
      };
    }

    case 'cf': {
      const cfPkt = pkt as { t: 'cf' } & UfConfig;
      const newConfig: UfConfig = {
        fw: String(cfPkt.fw ?? ''),
        dev: String(cfPkt.dev ?? ''),
        ssid: String(cfPkt.ssid ?? ''),
        rst: String(cfPkt.rst ?? ''),
        pend: (cfPkt.pend ?? 0) as 0 | 1,
        ap: String(cfPkt.ap ?? ''),
        fmode: Number(cfPkt.fmode ?? 0),
        fmin: Number(cfPkt.fmin ?? 30),
        day: Number(cfPkt.day ?? 0),
        wday: Number(cfPkt.wday ?? 127),
        man_min: Number(cfPkt.man_min ?? 30),
        c_hour: Number(cfPkt.c_hour ?? 8),
        c_min: Number(cfPkt.c_min ?? 0),
        c_dur: Number(cfPkt.c_dur ?? 0), // 0 = firmware cu hon 1.4.0, chua co che do Tu dat
        valve: (cfPkt.valve ?? 0) as 0 | 1,
        sens_rt: (cfPkt.sens_rt ?? 0) as 0 | 1,
        tds_auto: (cfPkt.tds_auto ?? 0) as 0 | 1,
        tds_int: Number(cfPkt.tds_int ?? 30),
        tds_run: Number(cfPkt.tds_run ?? 10),
        ptype: Number(cfPkt.ptype ?? 0),
        p_min: Number(cfPkt.p_min ?? 40),
        p_dirty: Number(cfPkt.p_dirty ?? 0),
        p_block: Number(cfPkt.p_block ?? 1200),
        v_min: Number(cfPkt.v_min ?? 50),
        v_max: Number(cfPkt.v_max ?? 1000),
        tds_alarm: Number(cfPkt.tds_alarm ?? 0),
        tds_k: Number(cfPkt.tds_k ?? 1.0),
        tds_z: Number(cfPkt.tds_z ?? 0),
        off_t: Number(cfPkt.off_t ?? 0),
        z_p: Number(cfPkt.z_p ?? 1.65),
        z_v: Number(cfPkt.z_v ?? 1.65),
        k_p: Number(cfPkt.k_p ?? 82.7),
        k_v: Number(cfPkt.k_v ?? 82.7),
        bz_key: (cfPkt.bz_key ?? 1) as 0 | 1,
        bz_alarm: (cfPkt.bz_alarm ?? 1) as 0 | 1,
        drain: (cfPkt.drain ?? 0) as 0 | 1,
        d_mode: Number(cfPkt.d_mode ?? 0),
        tds_hi: Number(cfPkt.tds_hi ?? 250),
        d_auto: Number(cfPkt.d_auto ?? -1), // -1 = firmware cu hon 1.6.4 (luon tu thay nuoc)
        d_warn: Number(cfPkt.d_warn ?? 0), // 0 = firmware cu hon 1.6.0 (xa tay cung tu dung sau d_sec)
        tds_try: Number(cfPkt.tds_try ?? 0), // 0 = firmware cu hon 1.5.1 (co dinh 5 lan)
        tds_gap: Number(cfPkt.tds_gap ?? 0), // 0 = firmware cu hon 1.5.0 (nghi co dinh 2 tieng)
        tds_lo: Number(cfPkt.tds_lo ?? 150),
        d_days: Number(cfPkt.d_days ?? 3),
        d_hour: Number(cfPkt.d_hour ?? 12),
        d_min: Number(cfPkt.d_min ?? 0),
        d_sec: Number(cfPkt.d_sec ?? 60),
        d_vmin: Number(cfPkt.d_vmin ?? 50),
        d_vmax: Number(cfPkt.d_vmax ?? 1000),
        z_d: Number(cfPkt.z_d ?? 1.667),
        k_d: Number(cfPkt.k_d ?? 82.7),
      };

      return {
        ...prev,
        config: newConfig,
      };
    }

    case 'ack': {
      return {
        ...prev,
        lastAck: pkt as UfAckPacket,
      };
    }

    case 'hi': {
      const hiPkt = pkt as UfHistoryPacket;
      const incomingEvents = Array.isArray(hiPkt.e) ? hiPkt.e : [];
      let updatedHistory = hiPkt.clr ? [] : [...prev.history];

      // Append events and deduplicate by [t, type, src, val]
      for (const ev of incomingEvents) {
        if (!updatedHistory.some((existing) => areEventsEqual(existing, ev))) {
          updatedHistory.push(ev);
        }
      }

      // Keep max 100 events
      if (updatedHistory.length > 100) {
        updatedHistory = updatedHistory.slice(0, 100);
      }

      return {
        ...prev,
        history: updatedHistory,
      };
    }

    case 'ev': {
      const evPkt = pkt as UfRealtimeEventPacket;
      const incomingEvents = Array.isArray(evPkt.e) ? evPkt.e : [];
      // Real-time events arrive oldest to newest, but web shows newest first.
      // We prepend new events to top, deduplicating
      const updatedHistory = [...prev.history];

      for (let i = incomingEvents.length - 1; i >= 0; i--) {
        const ev = incomingEvents[i];
        if (!updatedHistory.some((existing) => areEventsEqual(existing, ev))) {
          updatedHistory.unshift(ev);
        }
      }

      return {
        ...prev,
        history: updatedHistory.slice(0, 100),
      };
    }

    case 'wl': {
      const wlPkt = pkt as UfWifiScanPacket;
      return {
        ...prev,
        wifiList: Array.isArray(wlPkt.n) ? wlPkt.n : [],
        wifiScanError: wlPkt.err,
      };
    }

    default:
      return prev;
  }
}

function areEventsEqual(a: HistoryEventTuple, b: HistoryEventTuple): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}

/**
 * Packet Assembler for chunked BLE streams.
 * Handles UTF-8 multibyte characters split across chunks using TextDecoder({ stream: true }).
 * Discards buffers > 8KB without '\n' to prevent unbounded growth.
 */
export class PacketAssembler {
  private decoder = new TextDecoder('utf-8');
  private textBuffer = '';
  private readonly MAX_BUFFER_SIZE = 8192; // 8 KB

  /**
   * Feed raw bytes from BLE characteristic value.
   * Returns array of successfully parsed JSON packets.
   */
  public pushChunk(chunk: Uint8Array | ArrayBuffer | DataView): UfIncomingPacket[] {
    let bytes: Uint8Array;
    if (chunk instanceof Uint8Array) {
      bytes = chunk;
    } else if (chunk instanceof ArrayBuffer) {
      bytes = new Uint8Array(chunk);
    } else {
      bytes = new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    }

    // Decode with stream: true to properly assemble multibyte UTF-8 characters across chunks
    const decodedChunk = this.decoder.decode(bytes, { stream: true });
    this.textBuffer += decodedChunk;

    // Guard against overflow: if buffer exceeds 8KB without a newline, discard to resync
    if (this.textBuffer.length > this.MAX_BUFFER_SIZE) {
      const lastNl = this.textBuffer.lastIndexOf('\n');
      if (lastNl === -1) {
        this.textBuffer = '';
        return [];
      } else {
        this.textBuffer = this.textBuffer.slice(lastNl + 1);
      }
    }

    const packets: UfIncomingPacket[] = [];
    let newlineIndex: number;

    while ((newlineIndex = this.textBuffer.indexOf('\n')) !== -1) {
      const line = this.textBuffer.slice(0, newlineIndex).trim();
      this.textBuffer = this.textBuffer.slice(newlineIndex + 1);

      if (line.length > 0) {
        try {
          const parsed = JSON.parse(line) as UfIncomingPacket;
          if (parsed && typeof parsed === 'object') {
            packets.push(parsed);
          }
        } catch {
          // Ignore corrupted line and continue
        }
      }
    }

    return packets;
  }

  public reset(): void {
    this.textBuffer = '';
    this.decoder = new TextDecoder('utf-8');
  }
}
