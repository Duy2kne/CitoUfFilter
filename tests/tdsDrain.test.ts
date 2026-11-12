/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { applyPacket, INITIAL_APP_STATE } from '../src/services/packetParser';
import { drainGapSeconds, isSensorRealtime, parseErrors, tdsMaxTries, UfIncomingPacket } from '../src/types/system';

// Firmware 1.5.0: thay nuoc theo TDS - khoang nghi cai duoc, TDS lien tuc, 5 lan khong giam -> E13
describe('Water change by TDS (Firmware 1.5.0)', () => {
  it('gap between two TDS water changes follows tds_gap, old firmware stays at 2 hours', () => {
    expect(drainGapSeconds(1, 30)).toBe(1800);
    expect(drainGapSeconds(1, 0)).toBe(7200);
    expect(drainGapSeconds(1)).toBe(7200);
    expect(drainGapSeconds(0, 30)).toBe(3600);
  });

  it('reads tds_gap from cf and dtry from st', () => {
    const cf = { t: 'cf', drain: 1, d_mode: 1, tds_gap: 45 } as unknown as UfIncomingPacket;
    const st = { t: 'st', dtry: 3, p: [0, 1, 0], v: [0, 0, 0, 0], d: [1, 0, 1, 0] } as unknown as UfIncomingPacket;
    const s = applyPacket(applyPacket(INITIAL_APP_STATE, cf), st);
    expect(s.config?.tds_gap).toBe(45);
    expect(s.status?.dtry).toBe(3);
    const old = applyPacket(INITIAL_APP_STATE, { t: 'cf' } as unknown as UfIncomingPacket);
    expect(old.config?.tds_gap).toBe(0);
  });

  it('TDS water change forces continuous TDS on firmware 1.5.0 only', () => {
    expect(isSensorRealtime({ sens_rt: 0, drain: 1, d_mode: 1, tds_gap: 120 })).toBe(true);
    expect(isSensorRealtime({ sens_rt: 0, drain: 1, d_mode: 1, tds_gap: 0 })).toBe(false); // may cu
    expect(isSensorRealtime({ sens_rt: 0, drain: 1, d_mode: 0, tds_gap: 120 })).toBe(false);
    expect(isSensorRealtime({ sens_rt: 0, drain: 0, d_mode: 1, tds_gap: 120 })).toBe(false);
    expect(isSensorRealtime({ sens_rt: 1, drain: 0, d_mode: 0, tds_gap: 0 })).toBe(true);
    expect(isSensorRealtime({ sens_rt: 0, drain: 1, d_mode: 1, tds_gap: 120, d_auto: 0 })).toBe(false); // tat tu dong
    expect(isSensorRealtime({ sens_rt: 0, drain: 1, d_mode: 1, tds_gap: 120, d_auto: -1 })).toBe(true);
    expect(isSensorRealtime(null)).toBe(false);
  });

  it('max water changes in a row follows tds_try, older firmware stays at 5', () => {
    const cf = applyPacket(INITIAL_APP_STATE, { t: 'cf', tds_try: 8 } as unknown as UfIncomingPacket).config;
    expect(tdsMaxTries(cf)).toBe(8);
    const old = applyPacket(INITIAL_APP_STATE, { t: 'cf' } as unknown as UfIncomingPacket).config;
    expect(old?.tds_try).toBe(0);
    expect(tdsMaxTries(old)).toBe(5);
    expect(tdsMaxTries(null)).toBe(5);
  });

  it('E13 is a warning (bit 12), not a locking fault', () => {
    const list = parseErrors(0x1000, 0x1000);
    expect(list.map((e) => e.code)).toEqual(['E13']);
    expect(list[0].isWarning).toBe(true);
    expect(list[0].isLocking).toBe(false);
  });
});
