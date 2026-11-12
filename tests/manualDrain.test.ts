/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UfDemoDevice } from '../src/services/demo';
import { applyPacket, INITIAL_APP_STATE } from '../src/services/packetParser';
import { upcomingDrainTimes } from '../src/services/scheduleCalculator';
import { parseErrors, UfConfig, UfIncomingPacket, UfStatus } from '../src/types/system';

// Firmware 1.6.0: xa tay khong gioi han thoi gian, xa lien tuc qua d_warn phut -> canh bao E14
describe('Manual water change (Firmware 1.6.0)', () => {
  let dev: UfDemoDevice;
  let packets: UfIncomingPacket[];
  const last = <T>(t: string) => [...packets].reverse().find((p) => p.t === t) as unknown as T;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 12, 10, 5, 0));
    packets = [];
    dev = new UfDemoDevice();
    dev.setPacketCallback((p) => packets.push(p));
    dev.start();
    dev.handleCommand('AUTH', { pin: '1234' });
    vi.advanceTimersByTime(200);
  });

  afterEach(() => {
    dev.stop();
    vi.useRealTimers();
  });

  it('keeps draining past d_warn and raises E14 until stopped', () => {
    dev.handleCommand('SET', { drain: 1, d_warn: 5 });
    dev.handleCommand('DRAIN', { on: true });
    vi.advanceTimersByTime(60000);
    expect(last<UfStatus>('st').st).toBe(6);
    expect(last<UfStatus>('st').err & 0x2000).toBe(0);
    expect(last<UfStatus>('st').dleft).toBeGreaterThan(200);

    vi.advanceTimersByTime(5 * 60000);
    expect(last<UfStatus>('st').st).toBe(6); // van xa
    expect(last<UfStatus>('st').err & 0x2000).toBe(0x2000);
    expect(last<UfStatus>('st').dleft).toBe(0);

    dev.handleCommand('DRAIN', { on: false });
    vi.advanceTimersByTime(1000);
    expect(last<UfStatus>('st').st).not.toBe(6);
    expect(last<UfStatus>('st').err & 0x2000).toBe(0);
  });

  it('d_warn is clamped to 5..1440 minutes and read from cf; older firmware reports 0', () => {
    dev.handleCommand('SET', { d_warn: 1 });
    expect(last<UfConfig>('cf').d_warn).toBe(5);
    dev.handleCommand('SET', { d_warn: 9999 });
    expect(last<UfConfig>('cf').d_warn).toBe(1440);
    const old = applyPacket(INITIAL_APP_STATE, { t: 'cf' } as unknown as UfIncomingPacket).config;
    expect(old?.d_warn).toBe(0);
  });

  it('E14 is a warning (bit 13)', () => {
    const list = parseErrors(0x2000, 0x2000);
    expect(list.map((e) => e.code)).toEqual(['E14']);
    expect(list[0].isWarning).toBe(true);
  });

  it('upcoming timer water changes follow the firmware day rule', () => {
    const day = 20000; // chia het cho 4
    const now = day * 86400 + 13 * 3600; // 13:00
    expect(upcomingDrainTimes(now, 1, 12, 0, 2)).toEqual([(day + 1) * 86400 + 43200, (day + 2) * 86400 + 43200]);
    expect(upcomingDrainTimes(now, 1, 14, 30, 1)).toEqual([day * 86400 + 14 * 3600 + 1800]);
    expect(upcomingDrainTimes(now, 4, 12, 0, 2)).toEqual([(day + 4) * 86400 + 43200, (day + 8) * 86400 + 43200]);
  });
});
