/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { UfConfig } from '../types/system';

export type ScheduleConfig = Pick<UfConfig, 'fmode' | 'fmin' | 'day' | 'wday'> &
  Partial<Pick<UfConfig, 'c_hour' | 'c_min' | 'c_dur'>>;

export const CUSTOM_MODE = 5;

/** Custom mode: the run that starts on the calendar day of `date` (same as firmware _cus_start). */
export function customRunOfDay(date: Date, config: ScheduleConfig): { start: Date; end: Date } {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), config.c_hour ?? 8, config.c_min ?? 0, 0, 0);
  return { start, end: new Date(start.getTime() + Math.max(1, config.c_dur ?? 60) * 60000) };
}

/** Custom mode: the run that contains `time` (today's, or yesterday's run still going past midnight), else null. */
export function customRunAt(time: Date, config: ScheduleConfig): { start: Date; end: Date } | null {
  for (let k = 0; k < 2; k++) {
    const day = new Date(time.getFullYear(), time.getMonth(), time.getDate() - k);
    const run = customRunOfDay(day, config);
    if (time >= run.start && time < run.end && isDayActive(run.start, config.day, config.wday)) return run;
  }
  return null;
}

/**
 * Returns whether a given hour (0..23) is inside the mode's daily window (same table as firmware
 * settings_mode_in), and if it belongs to the previous day's window (spanning midnight).
 *   1 Daytime 08:00-12:00 + 14:00-17:00 (lunch break)   2 Evening 19:00-05:00
 *   3 Night   23:00-05:00                               4 All day
 */
export function getHourWindowInfo(
  hour: number,
  fmode: number
): { inWindow: boolean; belongsToPreviousDay: boolean } {
  const out = { inWindow: false, belongsToPreviousDay: false };
  switch (fmode) {
    case 1:
      return { inWindow: (hour >= 8 && hour < 12) || (hour >= 14 && hour < 17), belongsToPreviousDay: false };
    case 2:
    case 3: {
      const start = fmode === 2 ? 19 : 23;
      if (hour >= start) return { inWindow: true, belongsToPreviousDay: false };
      // After midnight: the day rule follows the day the window started (yesterday)
      if (hour < 5) return { inWindow: true, belongsToPreviousDay: true };
      return out;
    }
    case 4:
      return { inWindow: true, belongsToPreviousDay: false };
    default:
      return out; // 0 = manual: never runs by schedule
  }
}

/**
 * Checks whether a given calendar date is an active filtering day.
 * Rules:
 * 0: Every day
 * 1: Even day of month (2, 4, 6...)
 * 2: Odd day of month (1, 3, 5...)
 * 3: Every 3 days by day of the YEAR (dayOfYear0 % 3 === 0 => Jan 1, Jan 4, ... like firmware tm_yday % 3)
 * 4: By weekday bitmask (bit0=Sun, bit1=Mon, ..., bit6=Sat)
 */
export function isDayActive(date: Date, dayRule: number, wdayMask: number): boolean {
  const dayOfMonth = date.getDate();
  const dayOfWeek = date.getDay(); // 0 is Sunday, 1 is Monday ... 6 is Saturday

  switch (dayRule) {
    case 0: // Every day
      return true;
    case 1: // Even days
      return dayOfMonth % 2 === 0;
    case 2: // Odd days
      return dayOfMonth % 2 !== 0;
    case 3: {
      // Every 3 days by day of year (0-based), same as firmware tm_yday % 3 == 0
      const dayOfYear0 = Math.floor(
        (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(date.getFullYear(), 0, 1)) / 86400000
      );
      return dayOfYear0 % 3 === 0;
    }
    case 4: // By weekday
      // If mask is 0, firmware treats as all week (127)
      const mask = wdayMask === 0 ? 127 : wdayMask;
      return (mask & (1 << dayOfWeek)) !== 0;
    default:
      return true;
  }
}

/**
 * Checks if the pump is scheduled to run at a specific minute of a day.
 */
export function isFilterActiveAt(time: Date, config: ScheduleConfig): boolean {
  if (config.fmode === 0) return false;
  if (config.fmode === CUSTOM_MODE) return customRunAt(time, config) !== null;

  const hour = time.getHours();
  const minute = time.getMinutes();

  // Within the hour, it runs only during the first fmin minutes (from HH:00 to HH:fmin)
  if (minute >= config.fmin) {
    return false;
  }

  const { inWindow, belongsToPreviousDay } = getHourWindowInfo(hour, config.fmode);

  if (!inWindow) {
    return false;
  }

  // Determine the governing calendar day for the window
  const checkDate = new Date(time.getTime());
  if (belongsToPreviousDay) {
    checkDate.setDate(checkDate.getDate() - 1);
  }

  return isDayActive(checkDate, config.day, config.wday);
}

export interface HourScheduleSlot {
  hour: number;
  isActive: boolean;
  activeMinutes: number; // e.g. 30 (from :00 to :30)
  belongsToPrevDay: boolean;
  governingDateText: string;
}

/**
 * Generates schedule preview for all 24 hours (0..23) of a given date
 */
export function generate24HourSchedule(targetDate: Date, config: ScheduleConfig): HourScheduleSlot[] {
  const slots: HourScheduleSlot[] = [];

  if (config.fmode === CUSTOM_MODE) {
    // So phut cua tung gio nam trong luot hom nay + luot hom qua keo qua nua dem
    const runs = [0, 1]
      .map((k) => customRunOfDay(new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() - k), config))
      .filter((r) => isDayActive(r.start, config.day, config.wday));
    for (let hour = 0; hour < 24; hour++) {
      const h0 = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), hour).getTime();
      let ms = 0;
      let prev = false;
      runs.forEach((r) => {
        const part = Math.min(h0 + 3600000, r.end.getTime()) - Math.max(h0, r.start.getTime());
        if (part > 0) {
          ms += part;
          if (r.start.getDate() !== targetDate.getDate()) prev = true;
        }
      });
      const minutes = Math.min(60, Math.round(ms / 60000));
      slots.push({
        hour,
        isActive: minutes > 0,
        activeMinutes: minutes,
        belongsToPrevDay: prev,
        governingDateText: prev ? '(lượt bắt đầu hôm qua)' : '',
      });
    }
    return slots;
  }

  for (let hour = 0; hour < 24; hour++) {
    const { inWindow, belongsToPreviousDay } = getHourWindowInfo(hour, config.fmode);

    if (!inWindow) {
      slots.push({
        hour,
        isActive: false,
        activeMinutes: 0,
        belongsToPrevDay: false,
        governingDateText: '',
      });
      continue;
    }

    const checkDate = new Date(targetDate.getTime());
    checkDate.setHours(hour, 0, 0, 0);
    if (belongsToPreviousDay) {
      checkDate.setDate(checkDate.getDate() - 1);
    }

    const dayMatches = isDayActive(checkDate, config.day, config.wday);
    slots.push({
      hour,
      isActive: dayMatches,
      activeMinutes: dayMatches ? config.fmin : 0,
      belongsToPrevDay: belongsToPreviousDay,
      governingDateText: belongsToPreviousDay ? `(theo ngày ${checkDate.getDate()})` : '',
    });
  }

  return slots;
}

/**
 * Calculates the next upcoming scheduled run from `now`
 */
export function calculateNextScheduledRun(
  now: Date,
  config: ScheduleConfig
): { nextRun: Date; secondsUntil: number } | null {
  if (config.fmode === 0) return null;
  if (config.fmode === CUSTOM_MODE) {
    for (let k = 0; k <= 14; k++) {
      const { start } = customRunOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + k), config);
      if (start > now && isDayActive(start, config.day, config.wday)) {
        return { nextRun: start, secondsUntil: Math.floor((start.getTime() - now.getTime()) / 1000) };
      }
    }
    return null;
  }

  // Search through the next 14 days hour-by-hour
  const testTime = new Date(now.getTime());
  testTime.setSeconds(0, 0);

  // If we are currently inside an active slot, the *next* cycle is the next upcoming hour:00
  // Step minute to :00 of the next hour or test upcoming hours
  const currentMinute = testTime.getMinutes();
  if (currentMinute < config.fmin && isFilterActiveAt(testTime, config)) {
    // Machine is filtering right now! Next run is in the future
    testTime.setHours(testTime.getHours() + 1, 0, 0, 0);
  } else {
    // Next possible run is either this hour if minute=0 (not applicable since we are after), or next hour:00
    testTime.setHours(testTime.getHours() + 1, 0, 0, 0);
  }

  const maxHours = 24 * 14;
  for (let i = 0; i < maxHours; i++) {
    const candidate = new Date(testTime.getTime() + i * 3600 * 1000);
    candidate.setMinutes(0, 0, 0);

    if (isFilterActiveAt(candidate, config)) {
      const diffSecs = Math.max(0, Math.floor((candidate.getTime() - now.getTime()) / 1000));
      return {
        nextRun: candidate,
        secondsUntil: diffSecs,
      };
    }
  }

  return null;
}
