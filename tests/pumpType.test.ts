/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UfDemoDevice } from '../src/services/demo';
import { formatHistoryEvent } from '../src/services/history';
import { applyPacket, INITIAL_APP_STATE } from '../src/services/packetParser';
import { UfAckPacket, UfConfig, UfIncomingPacket, UfStatus } from '../src/types/system';

// Firmware 1.2.0: 2 loai bom (ptype) + loi ban (E3) ket luan theo dong trung binh khi luot loc ket thuc (pavg)
describe('Firmware 1.2.0 fields', () => {
  it('reads ptype from cf and pavg from st, with defaults for older firmware', () => {
    const s = applyPacket(
      applyPacket(INITIAL_APP_STATE, { t: 'cf', ptype: 1 } as unknown as UfIncomingPacket),
      { t: 'st', pavg: 312 } as unknown as UfIncomingPacket
    );
    expect(s.config?.ptype).toBe(1);
    expect(s.status?.pavg).toBe(312);

    const old = applyPacket(
      applyPacket(INITIAL_APP_STATE, { t: 'cf' } as unknown as UfIncomingPacket),
      { t: 'st' } as unknown as UfIncomingPacket
    );
    expect(old.config?.ptype).toBe(0);
    expect(old.status?.pavg).toBe(0);
  });

  it('history names the remote as the source of an action', () => {
    const ev = formatHistoryEvent([1794000000, 2, 2, 1]); // EV_POWER tu SRC_REMOTE
    expect(JSON.stringify(ev)).toContain('Remote');
  });
});

describe('Demo device: pump type and end-of-run dirty filter judgement', () => {
  let dev: UfDemoDevice;
  let packets: UfIncomingPacket[];
  const lastAck = () => [...packets].reverse().find((p) => p.t === 'ack') as UfAckPacket;
  const lastStatus = () => [...packets].reverse().find((p) => p.t === 'st') as unknown as UfStatus;
  const lastConfig = () => [...packets].reverse().find((p) => p.t === 'cf') as unknown as UfConfig;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 11, 9, 45, 0)); // Ngoai khung loc cua che do Ban dem
    dev = new UfDemoDevice();
    packets = [];
    dev.setPacketCallback((p) => packets.push(p));
    dev.start();
    dev.handleCommand('AUTH', { pin: '1234' });
    vi.advanceTimersByTime(200);
  });

  afterEach(() => {
    dev.stop();
    vi.useRealTimers();
  });

  it('switching pump type swaps the three thresholds and switching back restores them', () => {
    dev.handleCommand('SET', { ptype: 1 });
    expect(lastAck().ok).toBe(true);
    let cf = lastConfig();
    expect([cf.ptype, cf.p_min, cf.p_dirty, cf.p_block]).toEqual([1, 80, 800, 1200]);
    expect(lastStatus().fcl).toBe(-1); // Hoc lai dong loi sach

    dev.handleCommand('SET', { p_dirty: 900 }); // Chinh nguong cua bom lon
    dev.handleCommand('SET', { ptype: 0 });
    cf = lastConfig();
    expect([cf.ptype, cf.p_min, cf.p_dirty, cf.p_block]).toEqual([0, 40, 750, 1200]);

    dev.handleCommand('SET', { ptype: 1 }); // Bom lon van nho nguong da chinh
    expect(lastConfig().p_dirty).toBe(900);
  });

  it('dirty filter (E3) is NOT raised while the pump runs, only when the run ends, from the run average', () => {
    dev.handleCommand('SET', { p_dirty: 200 }); // Thap hon dong bom demo (~270 mA)
    dev.handleCommand('FILTER', { on: true });
    vi.advanceTimersByTime(45000);
    expect(lastStatus().p[2]).toBeGreaterThan(200);
    expect(lastStatus().err & 4).toBe(0); // Dang chay: chua ket luan

    dev.handleCommand('FILTER', { on: false });
    vi.advanceTimersByTime(3000);
    const st = lastStatus();
    expect(st.pavg).toBeGreaterThan(200);
    expect(st.err & 4).toBe(4);
    expect(st.wrn & 4).toBe(4);
    expect(st.fcl).toBe(0);

    // Luot sau trung binh thap hon nguong -> canh bao tu het
    dev.handleCommand('SET', { p_dirty: 350 });
    dev.handleCommand('FILTER', { on: true });
    vi.advanceTimersByTime(45000);
    dev.handleCommand('FILTER', { on: false });
    vi.advanceTimersByTime(3000);
    expect(lastStatus().err & 4).toBe(0);
    expect(lastStatus().fcl).toBeGreaterThan(50);
  });

  it('a run too short to average (TDS measurement) keeps the previous verdict', () => {
    const before = lastStatus().fcl;
    dev.handleCommand('MEASURE');
    vi.advanceTimersByTime(14000);
    expect(lastStatus().st).toBe(1);
    expect(lastStatus().fcl).toBe(before);
  });
});
