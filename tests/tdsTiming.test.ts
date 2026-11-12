/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UfDemoDevice } from '../src/services/demo';
import { applyPacket, INITIAL_APP_STATE } from '../src/services/packetParser';
import { drainGapSeconds, formatMinutes, UfAckPacket, UfConfig, UfIncomingPacket, UfStatus } from '../src/types/system';

// Firmware 1.3.0: chu ky do TDS (tds_int, phut) + thoi gian chay bom de do (tds_run, giay) chinh duoc;
// thay nuoc theo TDS: 2 lan xa cach nhau 2 tieng
describe('Firmware 1.3.0 fields', () => {
  it('reads tds_int / tds_run from cf, with 30 min / 10 s for older firmware', () => {
    const s = applyPacket(INITIAL_APP_STATE, { t: 'cf', tds_int: 60, tds_run: 20 } as unknown as UfIncomingPacket);
    expect([s.config?.tds_int, s.config?.tds_run]).toEqual([60, 20]);

    const old = applyPacket(INITIAL_APP_STATE, { t: 'cf' } as unknown as UfIncomingPacket);
    expect([old.config?.tds_int, old.config?.tds_run]).toEqual([30, 10]);
  });

  it('formats the interval and the rest between two water changes', () => {
    expect(formatMinutes(30)).toBe('30 phút');
    expect(formatMinutes(60)).toBe('1 tiếng');
    expect(formatMinutes(90)).toBe('1 tiếng 30 phút');
    expect(drainGapSeconds(0)).toBe(3600);
    expect(drainGapSeconds(1)).toBe(7200);
    expect(drainGapSeconds(undefined)).toBe(3600);
  });
});

describe('Demo device: adjustable TDS timing and the gap in TDS mode', () => {
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

  it('SET accepts tds_int / tds_run and clamps them like the firmware', () => {
    dev.handleCommand('SET', { tds_int: 60, tds_run: 20 });
    expect(lastAck().ok).toBe(true);
    expect([lastConfig().tds_int, lastConfig().tds_run]).toEqual([60, 20]);

    dev.handleCommand('SET', { tds_int: 1, tds_run: 999 });
    expect([lastConfig().tds_int, lastConfig().tds_run]).toEqual([5, 60]);
  });

  it('MEASURE runs the pump for tds_run seconds', () => {
    dev.handleCommand('SET', { tds_run: 20 });
    dev.handleCommand('MEASURE');
    expect(lastAck().msg).toContain('20 giây');
    vi.advanceTimersByTime(12000);
    expect(lastStatus().st).toBe(4); // 10 giay cu thi da xong
    expect(lastStatus().run.tot).toBe(20);
    vi.advanceTimersByTime(10000);
    expect(lastStatus().st).toBe(1);
  });

  it('water change in TDS mode is followed by the tds_gap rest (2 hours here)', () => {
    dev.handleCommand('SET', { drain: 1, d_mode: 1, d_sec: 5, tds_gap: 120 });
    dev.handleCommand('DRAIN', { on: true });
    expect(lastAck().ok).toBe(true);
    vi.advanceTimersByTime(8000);
    dev.handleCommand('DRAIN', { on: false }); // xa tay khong tu dung (Firmware 1.6.0)
    vi.advanceTimersByTime(1000);
    expect(lastStatus().st).not.toBe(6);
    expect(lastStatus().dcool).toBeGreaterThan(7000);

    dev.handleCommand('DRAIN', { on: true }); // xa tay khong bi chan boi thoi gian nghi
    expect(lastAck().ok).toBe(true);
  });
});
