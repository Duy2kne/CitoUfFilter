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
      win_s: 23,
      win_e: 5,
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

  it('Custom overnight window (22:00 - 02:00) correctly spans midnight', () => {
    const config = {
      fmode: 5, // Tùy chỉnh
      fmin: 30,
      day: 0, // Mỗi ngày
      wday: 127,
      win_s: 22,
      win_e: 2,
    };

    // Hour 21: before window
    const info21 = getHourWindowInfo(21, config.fmode, config.win_s, config.win_e);
    expect(info21.inWindow).toBe(false);

    // Hour 22: start of window, belongs to current day
    const info22 = getHourWindowInfo(22, config.fmode, config.win_s, config.win_e);
    expect(info22.inWindow).toBe(true);
    expect(info22.belongsToPreviousDay).toBe(false);

    // Hour 23: inside window, belongs to current day
    const info23 = getHourWindowInfo(23, config.fmode, config.win_s, config.win_e);
    expect(info23.inWindow).toBe(true);
    expect(info23.belongsToPreviousDay).toBe(false);

    // Hour 0: post-midnight inside window, belongs to previous day
    const info0 = getHourWindowInfo(0, config.fmode, config.win_s, config.win_e);
    expect(info0.inWindow).toBe(true);
    expect(info0.belongsToPreviousDay).toBe(true);

    // Hour 1: post-midnight inside window, belongs to previous day
    const info1 = getHourWindowInfo(1, config.fmode, config.win_s, config.win_e);
    expect(info1.inWindow).toBe(true);
    expect(info1.belongsToPreviousDay).toBe(true);

    // Hour 2: window ends at 02:00, so hour 2 is outside window
    const info2 = getHourWindowInfo(2, config.fmode, config.win_s, config.win_e);
    expect(info2.inWindow).toBe(false);
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
      fmode: 1, // Ban ngày: 08:00 - 17:00
      fmin: 30,
      day: 0, // Mỗi ngày
      wday: 127,
      win_s: 8,
      win_e: 17,
    };

    const slots = generate24HourSchedule(new Date(), config);
    expect(slots.length).toBe(24);

    expect(slots[7].isActive).toBe(false);
    expect(slots[8].isActive).toBe(true);
    expect(slots[8].activeMinutes).toBe(30);
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
