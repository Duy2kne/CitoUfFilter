/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UfDemoDevice } from '../src/services/demo';
import { UfAckPacket, UfConfig, UfIncomingPacket, UfStatus } from '../src/types/system';

// May gia lap phai tra loi giong firmware 1.1.0 (ble_control.cpp) de trang chinh thu duoc dung hanh vi that
describe('Demo device follows firmware 1.1.0 command rules', () => {
  let dev: UfDemoDevice;
  let packets: UfIncomingPacket[];

  const lastAck = () => [...packets].reverse().find((p) => p.t === 'ack') as UfAckPacket;
  const lastStatus = () => [...packets].reverse().find((p) => p.t === 'st') as unknown as UfStatus;
  const lastConfig = () => [...packets].reverse().find((p) => p.t === 'cf') as unknown as UfConfig;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 10, 9, 45, 0)); // 09:45: ngoai luot loc cua che do Ban dem
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

  it('manual filter runs the pump with a current between p_min and p_dirty, then stops on command', () => {
    dev.handleCommand('FILTER', { on: true });
    expect(lastAck().ok).toBe(true);
    vi.advanceTimersByTime(3000);
    const st = lastStatus();
    const cf = lastConfig();
    expect(st.st).toBe(3);
    expect(st.p[0]).toBe(1);
    expect(st.p[2]).toBeGreaterThan(cf.p_min);
    expect(st.p[2]).toBeLessThan(cf.p_dirty);
    expect(st.wt).toBeCloseTo((st.vn * st.p[2]) / 1000, 0);

    dev.handleCommand('FILTER', { on: false });
    vi.advanceTimersByTime(2000);
    expect(lastStatus().man).toBe(0);
    expect(lastStatus().p[0]).toBe(0);
  });

  it('SET rejects the removed custom-window keys and unknown keys as a whole', () => {
    dev.handleCommand('SET', { fmin: 45, win_s: 22 });
    expect(lastAck().ok).toBe(false);
    expect(lastConfig().fmin).toBe(30);
  });

  it('SET clamps like settings_validate and resets fmin when only the mode changes', () => {
    dev.handleCommand('SET', { man_min: 999 });
    expect(lastConfig().man_min).toBe(240);
    dev.handleCommand('SET', { fmode: 4 });
    expect(lastConfig().fmode).toBe(4);
    expect(lastConfig().fmin).toBe(10);
    dev.handleCommand('SET', { fmode: 5, c_hour: 30, c_dur: 5000 }); // Tu dat: ep gio / so phut ve vung hop le
    expect(lastConfig().fmode).toBe(5);
    expect(lastConfig().c_hour).toBe(23);
    expect(lastConfig().c_dur).toBe(1440);
    dev.handleCommand('SET', { fmode: 6 }); // che do khong co -> ve Ban dem
    expect(lastConfig().fmode).toBe(3);
  });

  it('manual water change: no time limit, stops on command, then a 1 hour cooldown blocks the next DRAIN', () => {
    dev.handleCommand('SET', { d_sec: 5 });
    dev.handleCommand('DRAIN', { on: true });
    expect(lastAck().ok).toBe(true);
    vi.advanceTimersByTime(2000);
    expect(lastStatus().st).toBe(6);
    expect(lastStatus().d[1]).toBe(1);

    vi.advanceTimersByTime(6000);
    expect(lastStatus().st).toBe(6); // xa tay: qua d_sec van xa
    expect(lastStatus().dman).toBe(1);
    dev.handleCommand('DRAIN', { on: false });
    vi.advanceTimersByTime(1000);
    expect(lastStatus().st).not.toBe(6);
    expect(lastStatus().dcool).toBeGreaterThan(3500);

    dev.handleCommand('DRAIN', { on: true });
    expect(lastAck().ok).toBe(false);
  });

  it('MEASURE runs the pump for 10 seconds and is refused while draining', () => {
    dev.handleCommand('MEASURE');
    expect(lastAck().ok).toBe(true);
    vi.advanceTimersByTime(2000);
    expect(lastStatus().st).toBe(4);
    vi.advanceTimersByTime(10000);
    expect(lastStatus().st).toBe(1);
    expect(lastStatus().tds_age).toBeLessThan(5);

    dev.handleCommand('DRAIN', { on: true });
    dev.handleCommand('MEASURE');
    expect(lastAck().a).toBe('MEASURE');
    expect(lastAck().ok).toBe(false);
  });
});
