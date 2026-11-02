/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  calculateFilterMetrics,
  formatEventTimestamp,
  formatHistoryEvent,
  hasNoClockBit,
} from '../src/services/history';
import { HistoryEventTuple } from '../src/types/system';

describe('History Event Timestamp Decoding', () => {
  it('correctly detects bit 31 set for timestamps before clock was acquired', () => {
    // 0x80000000 | 150 = 150 seconds after boot without clock
    const tWithBit31 = 0x80000000 | 150;
    expect(hasNoClockBit(tWithBit31)).toBe(true);

    const result = formatEventTimestamp(tWithBit31);
    expect(result.isUptime).toBe(true);
    expect(result.timeText).toContain('2 ph 30s sau khởi động');
    expect(result.dateKey).toBe('no_clock');
  });

  it('correctly reads timestamps when bit 31 is 0 (real clock time) using UTC accessors', () => {
    // Epoch timestamp corresponding to 2026-11-01 14:30:00 UTC
    // (Note: firmware local clock sent as epoch)
    const epochSecs = Math.floor(Date.UTC(2026, 10, 1, 14, 30, 0) / 1000);
    expect(hasNoClockBit(epochSecs)).toBe(false);

    const result = formatEventTimestamp(epochSecs);
    expect(result.isUptime).toBe(false);
    expect(result.timeText).toBe('14:30');
    expect(result.dateKey).toBe('2026-11-01');
  });

  it('formats boot and completed filter events properly', () => {
    const epochSecs = Math.floor(Date.UTC(2026, 10, 1, 23, 30, 0) / 1000);
    const filterEvent: HistoryEventTuple = [epochSecs, 4, 0, 1800]; // 30 min schedule run

    const formatted = formatHistoryEvent(filterEvent);
    expect(formatted.category).toBe('run');
    expect(formatted.title).toContain('Lọc theo lịch: Hoàn thành 30 phút');
    expect(formatted.sourceText).toBe('Tự động');
  });

  it('calculates metrics summing type 4 filter events', () => {
    const now = new Date();
    // Create an event for today
    const todayEpoch = Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 10, 0, 0) / 1000);

    const history: HistoryEventTuple[] = [
      [todayEpoch, 4, 0, 1800], // 30 mins
      [todayEpoch, 4, 1, 900], // 15 mins manual
      [todayEpoch, 2, 3, 1], // power on (not type 4)
    ];

    const metrics = calculateFilterMetrics(history);
    expect(metrics.minutesToday).toBe(45);
    expect(metrics.minutes7Days).toBe(45);
  });
});
