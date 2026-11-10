/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  generate24HourSchedule,
  getHourWindowInfo,
  isDayActive,
  isFilterActiveAt,
} from '../src/services/scheduleCalculator';

describe('Schedule Calculator & Midnight Window Logic', () => {
  it('Night mode (23:00–05:00) with Even days: 01:00 on Day 3 belongs to Day 2 window and IS ACTIVE', () => {
    const config = {
      fmode: 3, // Ban đêm: 23:00 - 05:00
      fmin: 30,
      day: 1, // Ngày chẵn (2, 4, 6...)
      wday: 127,
    };

    // Day 2 (Even day) at 23:15
    const day2At2315 = new Date(2026, 10, 2, 23, 15, 0);
    expect(isFilterActiveAt(day2At2315, config)).toBe(true);

    // Day 3 (Odd day) at 01:15 (belongs to the night window that started on Day 2)
    const day3At0115 = new Date(2026, 10, 3, 1, 15, 0);
    expect(isFilterActiveAt(day3At0115, config)).toBe(true);

    // Day 3 (Odd day) at 23:15 (Night window for Day 3, but Day 3 is odd)
    const day3At2315 = new Date(2026, 10, 3, 23, 15, 0);
    expect(isFilterActiveAt(day3At2315, config)).toBe(false);

    // Day 4 (Even day) at 01:15 (belongs to the night window of Day 3, which is odd)
    const day4At0115 = new Date(2026, 10, 4, 1, 15, 0);
    expect(isFilterActiveAt(day4At0115, config)).toBe(false);
  });

  it('Daytime mode has a lunch break and Evening mode spans midnight (same table as firmware settings_mode_in)', () => {
    // Ban ngay: 08-12 + 14-17
    expect(getHourWindowInfo(7, 1).inWindow).toBe(false);
    expect(getHourWindowInfo(8, 1).inWindow).toBe(true);
    expect(getHourWindowInfo(11, 1).inWindow).toBe(true);
    expect(getHourWindowInfo(12, 1).inWindow).toBe(false);
    expect(getHourWindowInfo(13, 1).inWindow).toBe(false);
    expect(getHourWindowInfo(14, 1).inWindow).toBe(true);
    expect(getHourWindowInfo(16, 1).inWindow).toBe(true);
    expect(getHourWindowInfo(17, 1).inWindow).toBe(false);

    // Buoi toi: 19-05, phan sau 0h thuoc ngay hom truoc
    expect(getHourWindowInfo(18, 2).inWindow).toBe(false);
    const info19 = getHourWindowInfo(19, 2);
    expect(info19.inWindow).toBe(true);
    expect(info19.belongsToPreviousDay).toBe(false);
    const info4 = getHourWindowInfo(4, 2);
    expect(info4.inWindow).toBe(true);
    expect(info4.belongsToPreviousDay).toBe(true);
    expect(getHourWindowInfo(5, 2).inWindow).toBe(false);

    // Thu cong khong bao gio tu chay; che do 5 (Tuy chinh) da bo khoi firmware 1.1.0
    expect(getHourWindowInfo(10, 0).inWindow).toBe(false);
    expect(getHourWindowInfo(10, 5).inWindow).toBe(false);
    // Ca ngay
    expect(getHourWindowInfo(3, 4).inWindow).toBe(true);
  });

  it('Weekday filter (day = 4) correctly filters by day-of-week bitmask', () => {
    // Only Monday (bit 1) and Wednesday (bit 3)
    const wdayMask = (1 << 1) | (1 << 3);

    // 2026-11-01 is a Sunday (getDay() === 0)
    const sunday = new Date(2026, 10, 1);
    expect(sunday.getDay()).toBe(0);
    expect(isDayActive(sunday, 4, wdayMask)).toBe(false);

    // 2026-11-02 is a Monday (getDay() === 1)
    const monday = new Date(2026, 10, 2);
    expect(monday.getDay()).toBe(1);
    expect(isDayActive(monday, 4, wdayMask)).toBe(true);

    // 2026-11-03 is a Tuesday (getDay() === 2)
    const tuesday = new Date(2026, 10, 3);
    expect(tuesday.getDay()).toBe(2);
    expect(isDayActive(tuesday, 4, wdayMask)).toBe(false);

    // 2026-11-04 is a Wednesday (getDay() === 3)
    const wednesday = new Date(2026, 10, 4);
    expect(wednesday.getDay()).toBe(3);
    expect(isDayActive(wednesday, 4, wdayMask)).toBe(true);
  });

  it('generates 24-hour preview schedule with correct slot flags', () => {
    const config = {
      fmode: 1, // Ban ngày: 08:00 - 12:00 + 14:00 - 17:00
      fmin: 30,
      day: 0, // Mỗi ngày
      wday: 127,
    };

    const slots = generate24HourSchedule(new Date(), config);
    expect(slots.length).toBe(24);

    expect(slots[7].isActive).toBe(false);
    expect(slots[8].isActive).toBe(true);
    expect(slots[8].activeMinutes).toBe(30);
    expect(slots[12].isActive).toBe(false); // nghi trua
    expect(slots[13].isActive).toBe(false);
    expect(slots[14].isActive).toBe(true);
    expect(slots[16].isActive).toBe(true);
    expect(slots[17].isActive).toBe(false);
  });

  it('Every 3 days follows day of YEAR like firmware (tm_yday % 3 == 0), not day of month', () => {
    expect(isDayActive(new Date(2026, 0, 1), 3, 127)).toBe(true); // yday 0
    expect(isDayActive(new Date(2026, 0, 2), 3, 127)).toBe(false); // yday 1
    expect(isDayActive(new Date(2026, 0, 4), 3, 127)).toBe(true); // yday 3
    expect(isDayActive(new Date(2026, 1, 1), 3, 127)).toBe(false); // 1/2: yday 31
    expect(isDayActive(new Date(2026, 1, 2), 3, 127)).toBe(false); // yday 32
    expect(isDayActive(new Date(2026, 0, 31), 3, 127)).toBe(true); // yday 30
  });
});
