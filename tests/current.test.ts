/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { applyPacket, INITIAL_APP_STATE } from '../src/services/packetParser';
import { assessCurrent, FILTER_MODES, UfIncomingPacket } from '../src/types/system';

// Nguong mac dinh cua firmware 1.1.0 (config.h): bom 40 / 350 / 700 mA, van 50 / 1000 mA
describe('assessCurrent (danh gia dong bom / van cho trang chinh)', () => {
  it('pump running: low / normal / dirty filter / over-current', () => {
    expect(assessCurrent(true, true, 10, 40, 700, 350).level).toBe('low');
    expect(assessCurrent(true, true, 260, 40, 700, 350).level).toBe('ok');
    expect(assessCurrent(true, true, 400, 40, 700, 350).level).toBe('high');
    expect(assessCurrent(true, true, 900, 40, 700, 350).level).toBe('over');
  });

  it('dirty warning switched off (p_dirty = 0) never reports "high"', () => {
    expect(assessCurrent(true, true, 600, 40, 700, 0).level).toBe('ok');
  });

  it('device off: idle with sensor noise, stuck MOSFET above 200 mA (firmware E4)', () => {
    expect(assessCurrent(false, true, 0, 40, 700, 350).level).toBe('idle');
    expect(assessCurrent(false, true, 25, 40, 700, 350).level).toBe('idle');
    expect(assessCurrent(false, true, 320, 40, 700, 350).level).toBe('stuck');
  });

  it('missing ACS712 wins over everything else', () => {
    expect(assessCurrent(true, false, 0, 40, 700, 350).level).toBe('nosensor');
    expect(assessCurrent(false, false, 0, 50, 1000).level).toBe('nosensor');
  });

  it('valve (no dirty threshold): low / ok / over', () => {
    expect(assessCurrent(true, true, 20, 50, 1000).level).toBe('low');
    expect(assessCurrent(true, true, 300, 50, 1000).level).toBe('ok');
    expect(assessCurrent(true, true, 1200, 50, 1000).level).toBe('over');
  });
});

describe('Firmware 1.1.0 packet fields', () => {
  it('reads dcool from st and sens_rt / d_mode / tds_hi / tds_lo from cf', () => {
    const st = { t: 'st', pw: 1, st: 1, dcool: 1800, p: [0, 1, 0], v: [0, 0, 0, 0], d: [1, 0, 1, 0] } as unknown as UfIncomingPacket;
    const cf = { t: 'cf', sens_rt: 1, d_mode: 1, tds_hi: 300, tds_lo: 180, drain: 1 } as unknown as UfIncomingPacket;
    const s = applyPacket(applyPacket(INITIAL_APP_STATE, st), cf);
    expect(s.status?.dcool).toBe(1800);
    expect(s.config?.sens_rt).toBe(1);
    expect(s.config?.d_mode).toBe(1);
    expect(s.config?.tds_hi).toBe(300);
    expect(s.config?.tds_lo).toBe(180);
  });

  it('older firmware without the new fields falls back to safe defaults', () => {
    const st = { t: 'st', pw: 1, st: 1 } as unknown as UfIncomingPacket;
    const cf = { t: 'cf' } as unknown as UfIncomingPacket;
    const s = applyPacket(applyPacket(INITIAL_APP_STATE, st), cf);
    expect(s.status?.dcool).toBe(0);
    expect(s.config?.sens_rt).toBe(0);
    expect(s.config?.d_mode).toBe(0);
  });

  it('filter mode list matches firmware FMODE_COUNT = 5 (custom mode 5 removed)', () => {
    expect(FILTER_MODES.map((m) => m.id)).toEqual([0, 1, 2, 3, 4]);
  });
});
