/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { UfConfig } from '../types/system';

export type ScheduleConfig = Pick<UfConfig, 'fmode' | 'fmin' | 'day' | 'wday' | 'win_s' | 'win_e'>;

/**
 * Returns whether a given hour (0..23) is inside the mode's daily window,
 * and if it belongs to the previous day's window (spanning midnight).
 */
export function getHourWindowInfo(
  hour: number,
  fmode: number,
  win_s: number,
  win_e: number
): { inWindow: boolean; belongsToPreviousDay: boolean } {
  if (fmode === 0) {
    // Manual mode: never automatically active
    return { inWindow: false, belongsToPreviousDay: false };
  }

  let start = 0;
  let end = 0;

  switch (fmode) {
    case 1: // Daytime 08:00 - 17:00
      start = 8;
      end = 17;
      break;
    case 2: // Evening 19:00 - 05:00
      start = 19;
      end = 5;
      break;
    case 3: // Night 23:00 - 05:00
      start = 23;
      end = 5;
      break;
    case 4: // 24/24
      return { inWindow: true, belongsToPreviousDay: false };
    case 5: // Custom
      start = ((win_s % 24) + 24) % 24;
      end = ((win_e % 24) + 24) % 24;
      if (start === end) {
        return { inWindow: true, belongsToPreviousDay: false };
      }
      break;
    default:
      return { inWindow: false, belongsToPreviousDay: false };
  }

  if (start < end) {
    // Normal window inside the same day, e.g. 8 to 17
    const inWindow = hour >= start && hour < end;
    return { inWindow, belongsToPreviousDay: false };
  } else {
    // Overnight window spanning midnight, e.g. 23 to 5 (hours 23, 0, 1, 2, 3, 4)
    if (hour >= start) {
      // Evening part, belongs to current calendar day
      return { inWindow: true, belongsToPreviousDay: false };
    } else if (hour < end) {
      // Post-midnight part (00:00 to end), belongs to the day the window started (yesterday)
      return { inWindow: true, belongsToPreviousDay: true };
    } else {
      return { inWindow: false, belongsToPreviousDay: false };
    }
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

  const hour = time.getHours();
  const minute = time.getMinutes();

  // Within the hour, it runs only during the first fmin minutes (from HH:00 to HH:fmin)
  if (minute >= config.fmin) {
    return false;
  }

  const { inWindow, belongsToPreviousDay } = getHourWindowInfo(
    hour,
    config.fmode,
    config.win_s,
    config.win_e
  );

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

  for (let hour = 0; hour < 24; hour++) {
    const { inWindow, belongsToPreviousDay } = getHourWindowInfo(
      hour,
      config.fmode,
      config.win_s,
      config.win_e
    );

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
