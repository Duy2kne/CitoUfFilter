/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UfDemoDevice } from '../src/services/demo';
import { formatHistoryEvent } from '../src/services/history';
import { applyPacket, INITIAL_APP_STATE } from '../src/services/packetParser';
import { UfAckPacket, UfConfig, UfIncomingPacket } from '../src/types/system';

// Diem 0 TDS (firmware 1.1.1): lenh TDS_ZERO + khoa cai dat tds_z
describe('TDS zero point', () => {
  it('reads tds_z from cf and defaults to 0 on firmware without it', () => {
    const withZ = applyPacket(INITIAL_APP_STATE, { t: 'cf', tds_z: 0.127 } as unknown as UfIncomingPacket);
    expect(withZ.config?.tds_z).toBeCloseTo(0.127, 3);
    const without = applyPacket(INITIAL_APP_STATE, { t: 'cf' } as unknown as UfIncomingPacket);
    expect(without.config?.tds_z).toBe(0);
  });

  it('history shows a zero-point event (EV_TDS_CAL with val 0) differently from a calibration', () => {
    const zero = formatHistoryEvent([1794000000, 14, 3, 0]);
    const cal = formatHistoryEvent([1794000000, 14, 3, 342]);
    expect(zero.title).toBe('Đặt điểm 0 TDS');
    expect(cal.title).toContain('342');
  });

  describe('demo device', () => {
    let dev: UfDemoDevice;
    let packets: UfIncomingPacket[];
    const lastAck = () => [...packets].reverse().find((p) => p.t === 'ack') as UfAckPacket;
    const lastConfig = () => [...packets].reverse().find((p) => p.t === 'cf') as unknown as UfConfig;

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 10, 11, 9, 45, 0));
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

    it('refuses TDS_ZERO while the probe still reads water (above about 120 ppm)', () => {
      dev.handleCommand('TDS_ZERO');
      expect(lastAck().a).toBe('TDS_ZERO');
      expect(lastAck().ok).toBe(false);
      expect(lastConfig().tds_z).toBe(0);
    });

    it('SET tds_z is accepted and clamped to 0 - 0.30 V', () => {
      dev.handleCommand('SET', { tds_z: 0.9 });
      expect(lastAck().ok).toBe(true);
      expect(lastConfig().tds_z).toBeCloseTo(0.3, 3);
      dev.handleCommand('SET', { tds_z: 0 });
      expect(lastConfig().tds_z).toBe(0);
    });
  });
});
