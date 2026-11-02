/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { applyPacket, INITIAL_APP_STATE, PacketAssembler } from '../src/services/packetParser';
import { formatCurrent, isLockedFault, parseErrors, UfIncomingPacket } from '../src/types/system';

describe('Packet Assembler & UTF-8 Chunk Splitting', () => {
  it('correctly reassembles packets sliced in the middle of multi-byte UTF-8 Vietnamese characters', () => {
    const assembler = new PacketAssembler();

    // Line containing multi-byte UTF-8 Vietnamese characters: "Đang lọc nước hồ cá"
    const jsonMessage = JSON.stringify({
      t: 'ack',
      a: 'FILTER',
      ok: true,
      msg: 'Đang lọc nước hồ cá CITO UF',
    }) + '\n';

    const encoder = new TextEncoder();
    const allBytes = encoder.encode(jsonMessage);

    // Intentionally cut across a multibyte character boundary (e.g. 20-byte MTU slices)
    const slice1 = allBytes.slice(0, 15);
    const slice2 = allBytes.slice(15, 33); // middle of "lọc nước"
    const slice3 = allBytes.slice(33);

    const packets1 = assembler.pushChunk(slice1);
    expect(packets1.length).toBe(0);

    const packets2 = assembler.pushChunk(slice2);
    expect(packets2.length).toBe(0);

    const packets3 = assembler.pushChunk(slice3);
    expect(packets3.length).toBe(1);
    expect(packets3[0]).toEqual({
      t: 'ack',
      a: 'FILTER',
      ok: true,
      msg: 'Đang lọc nước hồ cá CITO UF',
    });
  });

  it('handles null values for tds and w properly', () => {
    const packetWithNulls = {
      t: 'st' as const,
      tds: null,
      tds_age: null,
      tds_live: 120,
      w: null,
      wt: 15,
      vn: 24,
      kwh: 0.05,
      pw: 1 as const,
      fm: 3,
      st: 1,
      ph: 'STANDBY',
      run: { tot: 0, left: 0 },
      next: 1200,
      next_t: 0,
      man: 0 as const,
      p: [0, 1, 0] as [number, number, number],
      v: [0, 0, 0, 0] as [number, number, number, number],
      err: 0,
      wrn: 0,
      wifi: { sta: 2, ip: '192.168.1.100', rssi: -60 },
      up: 120,
      tk: 1 as const,
      heap: 180000,
      maxblk: 110000,
    };

    // Goi tu firmware cu: chua co fcl / rdur / d / dleft / dnext_t -> parser dung gia tri mac dinh
    const newState = applyPacket(INITIAL_APP_STATE, packetWithNulls as unknown as UfIncomingPacket);
    expect(newState.status?.fcl).toBe(-1);
    expect(newState.status?.d).toEqual([0, 0, 0, 0]);
    expect(newState.status?.dleft).toBe(0);
    expect(newState.status?.dnext_t).toBe(0);
    expect(newState.status?.tds).toBeNull();
    expect(newState.status?.w).toBeNull();
    expect(newState.status?.tds_age).toBeNull();
    expect(newState.status?.tds_live).toBe(120);
  });
});

describe('Formatters & Error Bitmask Translation', () => {
  it('formats current values: mA under 1A, A with 2 decimals >= 1A', () => {
    expect(formatCurrent(0)).toBe('0 mA');
    expect(formatCurrent(350)).toBe('350 mA');
    expect(formatCurrent(999)).toBe('999 mA');
    expect(formatCurrent(1000)).toBe('1.00 A');
    expect(formatCurrent(1450)).toBe('1.45 A');
    expect(formatCurrent(2500)).toBe('2.50 A');
  });

  it('translates error bitmasks properly (bit b = Eb+1) and differentiates warnings and locks', () => {
    // E1 is bit 0 (1 << 0 = 0x01)
    // E2 is bit 1 (1 << 1 = 0x02) - locking fault
    // E3 is bit 2 (1 << 2 = 0x04) - warning
    // E6 is bit 5 (1 << 5 = 0x20) - locking fault
    const errMask = (1 << 0) | (1 << 1) | (1 << 2); // E1 + E2 + E3
    const wrnMask = 1 << 2; // E3 is warning

    const errors = parseErrors(errMask, wrnMask);
    expect(errors.length).toBe(3);

    const e1 = errors.find((e) => e.code === 'E1');
    expect(e1?.name).toContain('Bơm không chạy');
    expect(e1?.isLocking).toBe(false);
    expect(e1?.isWarning).toBe(false);

    const e2 = errors.find((e) => e.code === 'E2');
    expect(e2?.name).toContain('Bơm quá dòng');
    expect(e2?.isLocking).toBe(true);
    expect(e2?.isWarning).toBe(false);

    const e3 = errors.find((e) => e.code === 'E3');
    expect(e3?.name).toContain('Lõi lọc bẩn');
    expect(e3?.isWarning).toBe(true);

    // Locking check test
    expect(isLockedFault(errMask)).toBe(true); // contains E2
    expect(isLockedFault(1 << 5)).toBe(true); // contains E6
    expect(isLockedFault(1 << 0)).toBe(false); // E1 alone is not locking
    expect(isLockedFault(1 << 2)).toBe(false); // E3 alone is not locking
    expect(isLockedFault(1 << 11)).toBe(true); // E12 van xa qua dong: khoa
    expect(isLockedFault(1 << 10)).toBe(false); // E11 van xa khong mo: khong khoa
  });

  it('parses water change errors E11 / E12', () => {
    const errors = parseErrors((1 << 10) | (1 << 11), 0);
    expect(errors.map((e) => e.code)).toEqual(['E11', 'E12']);
    expect(errors[1].isLocking).toBe(true);
  });

  it('parses drain + filter cleanliness fields of firmware 1.0.0 settings v2', () => {
    const st = applyPacket(INITIAL_APP_STATE, {
      t: 'st', d: [1, 1, 1, 180], dleft: 42, dnext_t: 1793577600, fcl: 92, fcl_ma: 260, rdur: 239,
    } as unknown as UfIncomingPacket);
    expect(st.status?.d).toEqual([1, 1, 1, 180]);
    expect(st.status?.dleft).toBe(42);
    expect(st.status?.fcl).toBe(92);
    expect(st.status?.rdur).toBe(239);
    const cf = applyPacket(INITIAL_APP_STATE, {
      t: 'cf', drain: 1, d_days: 3, d_hour: 23, d_min: 30, d_sec: 90,
    } as unknown as UfIncomingPacket);
    expect(cf.config?.drain).toBe(1);
    expect(cf.config?.d_hour).toBe(23);
    expect(cf.config?.d_sec).toBe(90);
  });
});
