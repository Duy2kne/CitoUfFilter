/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  Calendar,
  Check,
  Clock,
  Hand,
  Info,
  Moon,
  Repeat,
  Save,
  Sun,
  Timer,
} from 'lucide-react';
import {
  DAY_OPTIONS,
  FILTER_MODES,
  UfConfig,
  WEEKDAYS,
} from '../types/system';
import { generate24HourSchedule } from '../services/scheduleCalculator';

interface ScheduleTabProps {
  config: UfConfig | null;
  onSendCommand: (action: string, params?: Record<string, unknown>) => Promise<unknown>;
}

export const ScheduleTab: React.FC<ScheduleTabProps> = ({ config, onSendCommand }) => {
  // Local form state
  const [fmode, setFmode] = useState<number>(3);
  const [fmin, setFmin] = useState<number>(30);
  const [day, setDay] = useState<number>(0);
  const [wday, setWday] = useState<number>(127);
  const [winS, setWinS] = useState<number>(23);
  const [winE, setWinE] = useState<number>(5);
  const [manMin, setManMin] = useState<number>(30);
  const [isSaving, setIsSaving] = useState(false);

  // Sync form when config packet arrives from machine (even when changed by buttons on physical device)
  useEffect(() => {
    if (!config) return;
    setFmode(config.fmode);
    setFmin(config.fmin);
    setDay(config.day);
    setWday(config.wday);
    setWinS(config.win_s);
    setWinE(config.win_e);
    setManMin(config.man_min);
  }, [
    config?.fmode,
    config?.fmin,
    config?.day,
    config?.wday,
    config?.win_s,
    config?.win_e,
    config?.man_min,
  ]);

  // Compute modified keys to send ONLY modified keys in SET command
  const getModifiedKeys = (): Record<string, unknown> => {
    if (!config) return {};
    const diff: Record<string, unknown> = {};
    if (fmode !== config.fmode) diff.fmode = fmode;
    if (fmin !== config.fmin) diff.fmin = fmin;
    if (day !== config.day) diff.day = day;
    if (wday !== config.wday) diff.wday = wday;
    if (winS !== config.win_s) diff.win_s = winS;
    if (winE !== config.win_e) diff.win_e = winE;
    if (manMin !== config.man_min) diff.man_min = manMin;
    return diff;
  };

  const modifiedKeys = getModifiedKeys();
  const hasChanges = Object.keys(modifiedKeys).length > 0;

  const handleSave = async () => {
    if (!hasChanges) return;
    try {
      setIsSaving(true);
      await onSendCommand('SET', modifiedKeys);
    } finally {
      setIsSaving(false);
    }
  };

  const toggleWeekday = (bit: number) => {
    const currentMask = wday;
    const isSet = (currentMask & (1 << bit)) !== 0;
    let nextMask = isSet ? currentMask & ~(1 << bit) : currentMask | (1 << bit);
    // Do not allow deselecting all days
    if (nextMask === 0) {
      nextMask = 1 << bit;
    }
    setWday(nextMask);
  };

  // Generate 24-hour visual schedule preview for today
  const now = new Date();
  const todayScheduleSlots = generate24HourSchedule(now, {
    fmode,
    fmin,
    day,
    wday,
    win_s: winS,
    win_e: winE,
  });

  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentHourProgress = currentMinute / 60;

  const getModeIcon = (icon: string) => {
    switch (icon) {
      case 'hand':
        return <Hand className="w-5 h-5" />;
      case 'sun':
        return <Sun className="w-5 h-5 text-amber-400" />;
      case 'moon-night':
        return <Moon className="w-5 h-5 text-indigo-400" />;
      case 'moon':
        return <Moon className="w-5 h-5 text-cyan-400" />;
      case 'repeat':
        return <Repeat className="w-5 h-5 text-emerald-400" />;
      case 'clock':
        return <Clock className="w-5 h-5 text-blue-400" />;
      default:
        return <Calendar className="w-5 h-5" />;
    }
  };

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-200">
      {/* Header with Save Button */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-100">Cài đặt lịch lọc nước</h2>
          <p className="text-xs text-slate-400">Tự động lặp lại theo chu kỳ giờ và ngày</p>
        </div>
        <button
          onClick={handleSave}
          disabled={!hasChanges || isSaving}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold shadow-md transition-all ${
            hasChanges
              ? 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-cyan-950/60 active:scale-95 animate-pulse'
              : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50'
          }`}
        >
          <Save className="w-4 h-4" />
          <span>{isSaving ? 'Đang lưu…' : hasChanges ? `Lưu lịch (${Object.keys(modifiedKeys).length})` : 'Đã lưu'}</span>
        </button>
      </div>

      {/* 24-Hour Visual Schedule Timeline Preview */}
      <div className="p-4 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-3">
        <div className="flex items-center justify-between text-xs">
          <div className="font-semibold text-slate-200 flex items-center gap-2">
            <Clock className="w-4 h-4 text-cyan-400" />
            <span>Xem trước lịch lọc hôm nay ({now.getDate()}/{now.getMonth() + 1})</span>
          </div>
          <div className="text-[11px] text-slate-400 flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded bg-cyan-500" /> Đang lọc
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded bg-slate-800 border border-slate-700" /> Nghỉ
            </span>
          </div>
        </div>

        {/* 24 Hour Bar Graph */}
        <div className="relative pt-2 pb-1">
          <div className="grid grid-cols-24 gap-0.5 sm:gap-1 h-9 rounded-xl overflow-hidden bg-slate-950 p-1 border border-slate-800">
            {todayScheduleSlots.map((slot) => (
              <div
                key={slot.hour}
                title={`Giờ ${slot.hour}:00 - ${slot.isActive ? `Lọc ${slot.activeMinutes} phút ${slot.governingDateText}` : 'Nghỉ'}`}
                className={`relative h-full rounded transition-all flex items-end justify-center ${
                  slot.isActive
                    ? 'bg-gradient-to-t from-cyan-600 to-blue-500 shadow-[0_0_8px_rgba(6,182,212,0.4)]'
                    : 'bg-slate-800/40 hover:bg-slate-800'
                }`}
              >
                {slot.isActive && (
                  <span className="text-[8px] font-mono text-white/90 pb-0.5 font-bold">
                    {slot.activeMinutes === 60 ? '60' : slot.activeMinutes}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Current Time Indicator Marker */}
          <div
            className="absolute top-0 bottom-0 pointer-events-none z-10 flex flex-col items-center"
            style={{
              left: `${((currentHour + currentHourProgress) / 24) * 100}%`,
            }}
          >
            <div className="w-0.5 h-full bg-rose-500 shadow-[0_0_8px_#f43f5e]" />
            <span className="text-[9px] font-mono font-bold text-rose-400 bg-rose-950 px-1 rounded border border-rose-800/60 -mt-1">
              Bây giờ
            </span>
          </div>
        </div>

        {/* Timeline hour labels (0, 6, 12, 18, 24) */}
        <div className="flex justify-between text-[10px] font-mono text-slate-500 px-1">
          <span>00:00</span>
          <span>06:00</span>
          <span>12:00</span>
          <span>18:00</span>
          <span>24:00</span>
        </div>
      </div>

      {/* 1. Filter Mode Selector (fmode) */}
      <div className="space-y-3">
        <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
          1. Chế độ lọc (Khung giờ)
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
          {FILTER_MODES.map((mode) => {
            const isSelected = fmode === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => setFmode(mode.id)}
                className={`p-4 rounded-2xl border text-left transition-all relative flex flex-col justify-between ${
                  isSelected
                    ? 'bg-slate-900 border-cyan-500 shadow-lg shadow-cyan-950/40 text-slate-100'
                    : 'bg-slate-900/60 border-slate-800/90 hover:border-slate-700 text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-2">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                        isSelected ? 'bg-cyan-950 text-cyan-400 border border-cyan-800/60' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {getModeIcon(mode.icon)}
                    </div>
                    <span className="font-bold text-sm">{mode.name}</span>
                  </div>
                  {isSelected && (
                    <div className="w-5 h-5 rounded-full bg-cyan-500 text-slate-950 flex items-center justify-center">
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    </div>
                  )}
                </div>

                <div className="text-xs font-semibold text-cyan-400 font-mono mb-1">
                  {mode.id === 5 ? `${winS}:00 – ${winE}:00` : mode.hours}
                </div>
                <div className="text-[11px] text-slate-400 leading-normal">{mode.desc}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom Window Hours (shown only when fmode === 5) */}
      {fmode === 5 && (
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-cyan-800/40 space-y-3 animate-in fade-in">
          <div className="flex items-center gap-2 text-xs font-bold text-cyan-300">
            <Clock className="w-4 h-4 text-cyan-400" />
            <span>Cài đặt giờ khung Tùy chỉnh</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Giờ bắt đầu (win_s):</label>
              <select
                value={winS}
                onChange={(e) => setWinS(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100 font-mono outline-none"
              >
                {Array.from({ length: 24 }).map((_, h) => (
                  <option key={h} value={h}>
                    {h.toString().padStart(2, '0')}:00
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Giờ kết thúc (win_e):</label>
              <select
                value={winE}
                onChange={(e) => setWinE(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100 font-mono outline-none"
              >
                {Array.from({ length: 24 }).map((_, h) => (
                  <option key={h} value={h}>
                    {h.toString().padStart(2, '0')}:00
                  </option>
                ))}
              </select>
            </div>
          </div>

          <p className="text-[11px] text-slate-400 leading-relaxed">
            * Lưu ý: Nếu giờ bắt đầu = giờ kết thúc, máy sẽ lọc cả ngày (24/24). Nếu giờ bắt đầu lớn hơn giờ kết thúc (ví dụ 22:00 – 05:00), máy sẽ lọc qua nửa đêm.
          </p>
        </div>
      )}

      {/* 2. Minutes Per Hour Slider (fmin) */}
      <div className="p-5 rounded-3xl bg-slate-900/80 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
              2. Thời gian lọc mỗi giờ (fmin)
            </label>
            <p className="text-xs text-slate-400 mt-0.5">
              Trong khung giờ đã chọn, máy bắt đầu lọc từ đầu giờ (HH:00)
            </p>
          </div>
          <div className="text-right">
            <span className="text-2xl font-black font-mono text-cyan-400">{fmin}</span>
            <span className="text-xs font-semibold text-slate-400 ml-1">phút/giờ</span>
          </div>
        </div>

        <div className="space-y-2">
          <input
            type="range"
            min={5}
            max={60}
            step={5}
            value={fmin}
            onChange={(e) => setFmin(Number(e.target.value))}
            className="w-full accent-cyan-500 cursor-pointer h-2 bg-slate-950 rounded-lg"
          />
          <div className="flex justify-between text-[10px] font-mono text-slate-500">
            <span>5 ph</span>
            <span>15 ph</span>
            <span>30 ph (chuẩn)</span>
            <span>45 ph</span>
            <span>60 ph (liên tục)</span>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 text-xs text-slate-300 flex items-start gap-2.5">
          <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
          <span>
            {fmin === 60 ? (
              <strong className="text-cyan-300">Máy sẽ lọc liên tục không nghỉ</strong>
            ) : (
              <>
                Mỗi giờ máy lọc <strong className="text-cyan-300">{fmin} phút</strong> (từ :00 đến :{fmin.toString().padStart(2, '0')}), sau đó nghỉ{' '}
                <strong className="text-slate-200">{60 - fmin} phút</strong> đến hết giờ.
              </>
            )}
          </span>
        </div>
      </div>

      {/* 3. Filter Days Rule (day & wday) */}
      <div className="p-5 rounded-3xl bg-slate-900/80 border border-slate-800 space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
            3. Ngày trong tháng / trong tuần (day)
          </label>
          <p className="text-xs text-slate-400 mt-0.5">Quy định những ngày máy được phép chạy</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {DAY_OPTIONS.map((opt) => {
            const isSelected = day === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setDay(opt.id)}
                className={`p-3 rounded-xl border text-left transition-all ${
                  isSelected
                    ? 'bg-cyan-950/60 border-cyan-500 text-slate-100 shadow-md shadow-cyan-950/30'
                    : 'bg-slate-950/70 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="text-xs font-bold">{opt.name}</div>
                <div className="text-[10px] text-slate-400 mt-0.5 leading-snug">{opt.desc}</div>
              </button>
            );
          })}
        </div>

        {/* Weekday Selector (when day === 4) */}
        {day === 4 && (
          <div className="pt-2 border-t border-slate-800 space-y-2 animate-in fade-in">
            <span className="text-xs font-semibold text-slate-300">
              Chọn các ngày trong tuần (wday):
            </span>
            <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
              {WEEKDAYS.map((wd) => {
                const isActive = (wday & (1 << wd.bit)) !== 0;
                return (
                  <button
                    key={wd.bit}
                    type="button"
                    onClick={() => toggleWeekday(wd.bit)}
                    className={`py-2 rounded-xl text-xs font-bold transition-all border ${
                      isActive
                        ? 'bg-cyan-600 border-cyan-400 text-white shadow-sm'
                        : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {wd.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 4. Manual Filter Duration (man_min) */}
      <div className="p-5 rounded-3xl bg-slate-900/80 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
              4. Thời lượng khi bấm &quot;Lọc ngay&quot; (man_min)
            </label>
            <p className="text-xs text-slate-400 mt-0.5">Số phút bơm chạy cho mỗi lượt lọc thủ công</p>
          </div>
          <div className="text-right">
            <span className="text-2xl font-black font-mono text-cyan-400">{manMin}</span>
            <span className="text-xs font-semibold text-slate-400 ml-1">phút</span>
          </div>
        </div>

        <input
          type="range"
          min={5}
          max={240}
          step={5}
          value={manMin}
          onChange={(e) => setManMin(Number(e.target.value))}
          className="w-full accent-cyan-500 cursor-pointer h-2 bg-slate-950 rounded-lg"
        />
        <div className="flex justify-between text-[10px] font-mono text-slate-500">
          <span>5 ph</span>
          <span>30 ph</span>
          <span>60 ph</span>
          <span>120 ph</span>
          <span>240 ph</span>
        </div>
      </div>

      {/* Floating Save Bar on changes */}
      {hasChanges && (
        <div className="sticky bottom-6 z-30 p-4 rounded-2xl bg-cyan-950/95 border border-cyan-500/60 shadow-2xl backdrop-blur-md flex items-center justify-between gap-3 animate-in slide-in-from-bottom-2">
          <div className="text-xs text-cyan-100">
            Bạn có <strong className="font-bold text-white">{Object.keys(modifiedKeys).length}</strong> cài đặt chưa lưu
          </div>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-cyan-600 hover:bg-cyan-500 shadow-lg shadow-cyan-950/50 transition-all active:scale-95"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'Đang lưu…' : 'Lưu cài đặt ngay'}</span>
          </button>
        </div>
      )}
    </div>
  );
};
