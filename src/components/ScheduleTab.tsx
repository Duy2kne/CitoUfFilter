/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  Calendar,
  CalendarClock,
  Check,
  Clock,
  Hand,
  Info,
  Moon,
  Repeat,
  Save,
  Sun,
} from 'lucide-react';
import {
  DAY_OPTIONS,
  FILTER_MODES,
  formatHm,
  formatLocalHm,
  formatMinutes,
  UfConfig,
  WEEKDAYS,
} from '../types/system';

import { generate24HourSchedule, upcomingDrainTimes } from '../services/scheduleCalculator';

// O nhap so di kem thanh truot: go tu do; roi khoi o / bam Enter thi ep ve [min, max]
const NumBox: React.FC<{
  value: number;
  min: number;
  max: number;
  label: string;
  onChange: (v: number) => void;
  tone?: string;
}> = ({ value, min, max, label, onChange, tone = 'text-cyan-400' }) => {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const n = Math.round(Number(text));
    const v = text.trim() !== '' && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : value;
    onChange(v);
    setText(String(v));
  };
  return (
    <input
      type="number"
      inputMode="numeric"
      aria-label={label}
      min={min}
      max={max}
      step={1}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value !== '' && Number.isInteger(n) && n >= min && n <= max) onChange(n);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      className={`w-[4.5rem] bg-slate-950 border border-slate-700 focus:border-cyan-500 outline-none rounded-xl px-2 py-1 text-right text-xl font-black font-mono ${tone}`}
    />
  );
};

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
  const [manMin, setManMin] = useState<number>(30);
  const [cHour, setCHour] = useState<number>(8);
  const [cMin, setCMin] = useState<number>(0);
  const [cDur, setCDur] = useState<number>(60);
  const [dDays, setDDays] = useState<number>(3);
  const [dHour, setDHour] = useState<number>(12);
  const [dMin, setDMin] = useState<number>(0);
  const [dSec, setDSec] = useState<number>(60);
  const [dMode, setDMode] = useState<number>(0);
  const [tdsHi, setTdsHi] = useState<number>(250);
  const [tdsLo, setTdsLo] = useState<number>(150);
  const [tdsGap, setTdsGap] = useState<number>(120);
  const [tdsTry, setTdsTry] = useState<number>(5);
  const [dWarn, setDWarn] = useState<number>(60);
  const [isSaving, setIsSaving] = useState(false);

  // Sync form when config packet arrives from machine (even when changed by buttons on physical device)
  useEffect(() => {
    if (!config) return;
    setFmode(config.fmode);
    setFmin(config.fmin);
    setDay(config.day);
    setWday(config.wday);
    setManMin(config.man_min);
    setCHour(config.c_hour);
    setCMin(config.c_min);
    setCDur(config.c_dur > 0 ? config.c_dur : 60);
    setDDays(config.d_days);
    setDHour(config.d_hour);
    setDMin(config.d_min);
    setDSec(config.d_sec);
    setDMode(config.d_mode);
    setTdsHi(config.tds_hi);
    setTdsLo(config.tds_lo);
    setTdsGap(config.tds_gap > 0 ? config.tds_gap : 120);
    setTdsTry(config.tds_try > 0 ? config.tds_try : 5);
    setDWarn(config.d_warn > 0 ? config.d_warn : 60);
  }, [
    config?.fmode,
    config?.fmin,
    config?.day,
    config?.wday,
    config?.man_min,
    config?.c_hour,
    config?.c_min,
    config?.c_dur,
    config?.d_days,
    config?.d_hour,
    config?.d_min,
    config?.d_sec,
    config?.d_mode,
    config?.tds_hi,
    config?.tds_lo,
    config?.tds_gap,
    config?.tds_try,
    config?.d_warn,
  ]);

  // Compute modified keys to send ONLY modified keys in SET command
  const getModifiedKeys = (): Record<string, unknown> => {
    if (!config) return {};
    const diff: Record<string, unknown> = {};
    if (fmode !== config.fmode) diff.fmode = fmode;
    if (fmin !== config.fmin) diff.fmin = fmin;
    if (day !== config.day) diff.day = day;
    if (wday !== config.wday) diff.wday = wday;
    if (manMin !== config.man_min) diff.man_min = manMin;
    // Che do Tu dat (may cu hon Firmware 1.4.0 khong biet 3 khoa nay -> khong gui)
    if (config.c_dur > 0) {
      if (cHour !== config.c_hour) diff.c_hour = cHour;
      if (cMin !== config.c_min) diff.c_min = cMin;
      if (cDur !== config.c_dur) diff.c_dur = cDur;
    }
    if (config.drain === 1) {
      if (dDays !== config.d_days) diff.d_days = dDays;
      if (dHour !== config.d_hour) diff.d_hour = dHour;
      if (dMin !== config.d_min) diff.d_min = dMin;
      if (dSec !== config.d_sec) diff.d_sec = dSec;
      if (dMode !== config.d_mode) diff.d_mode = dMode;
      // Muc tren + muc duoi phu thuoc nhau (may ep duoi < tren) -> doi 1 cai thi gui ca 2
      if (tdsHi !== config.tds_hi || tdsLo !== config.tds_lo) {
        diff.tds_hi = tdsHi;
        diff.tds_lo = tdsLo;
      }
      if (config.tds_gap > 0 && tdsGap !== config.tds_gap) diff.tds_gap = tdsGap; // Firmware 1.5.0 tro len
      if (config.tds_try > 0 && tdsTry !== config.tds_try) diff.tds_try = tdsTry; // Firmware 1.5.1 tro len
      if (config.d_warn > 0 && dWarn !== config.d_warn) diff.d_warn = dWarn; // Firmware 1.6.0 tro len
    }
    return diff;
  };

  const modifiedKeys = getModifiedKeys();
  const hasChanges = Object.keys(modifiedKeys).length > 0;
  const tdsGapSupported = !config || config.tds_gap > 0;
  const tdsTrySupported = !config || config.tds_try > 0;
  const tdsLevelsOk = tdsLo >= 20 && tdsHi <= 2000 && tdsLo + 10 <= tdsHi && tdsGap >= 10 && tdsGap <= 1440;
  const clampDSec = (s: number) => Math.min(1800, Math.max(5, s));
  const dWarnSupported = !config || config.d_warn > 0; // Firmware 1.6.0: xa tay khong gioi han, qua d_warn phut -> E14
  const clampDWarn = (m: number) => Math.min(1440, Math.max(5, m));
  const drainLenText =
    dSec < 60 ? `${dSec} giây` : dSec % 60 === 0 ? `${dSec / 60} phút` : `${Math.floor(dSec / 60)} phút ${dSec % 60} giây`;
  // Cac lan thay nuoc hen gio sap toi (tinh giong may: so ngay tu 1970 chia het cho d_days)
  const localNowSec = Math.floor(Date.now() / 1000 - new Date().getTimezoneOffset() * 60);
  const upcomingDrains = upcomingDrainTimes(localNowSec, dDays, dHour, dMin, 3);
  const clampTdsGap = (m: number) => Math.min(1440, Math.max(10, m)); // 10 phut .. 24 gio (giong firmware)
  const customSupported = !config || config.c_dur > 0; // Firmware 1.4.0 tro len
  const isCustom = fmode === 5;
  const cDurOk = cDur >= 1 && cDur <= 1440;
  const cEndTotal = cHour * 60 + cMin + cDur; // Phut ket thuc tinh tu 00:00 ngay bat dau
  const cEndText = `${formatHm(Math.floor(cEndTotal / 60) % 24, cEndTotal % 60)}${cEndTotal >= 1440 ? ' hôm sau' : ''}`;

  // Doi che do loc: phut / gio ve mac dinh cua che do do (giong may), nguoi dung chinh lai duoc
  const MODE_DEFAULT_FMIN: Record<number, number> = { 1: 20, 2: 30, 3: 30, 4: 10 };
  const handlePickMode = (id: number) => {
    if (id === fmode) return;
    setFmode(id);
    if (MODE_DEFAULT_FMIN[id]) setFmin(config && id === config.fmode ? config.fmin : MODE_DEFAULT_FMIN[id]);
  };

  const handleSave = async () => {
    if (!hasChanges) return;
    if (config?.drain === 1 && dMode === 1 && !tdsLevelsOk) return;
    if (isCustom && !cDurOk) return;
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
    c_hour: cHour,
    c_min: cMin,
    c_dur: cDur,
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
      case 'custom':
        return <CalendarClock className="w-5 h-5 text-fuchsia-400" />;
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

      {/* 1. Filter Days Rule (day & wday) */}
      <div className="p-5 rounded-3xl bg-slate-900/80 border border-slate-800 space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
            1. Ngày được phép lọc
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
              Chọn các ngày trong tuần:
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

      {/* 2. Filter Mode Selector */}
      <div className="space-y-3">
        <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
          2. Chế độ lọc (Khung giờ)
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
          {FILTER_MODES.map((mode) => {
            const isSelected = fmode === mode.id;
            const needsNewFw = mode.id === 5 && !customSupported;
            return (
              <button
                key={mode.id}
                type="button"
                disabled={needsNewFw}
                onClick={() => handlePickMode(mode.id)}
                className={`p-4 rounded-2xl border text-left transition-all relative flex flex-col justify-between ${
                  needsNewFw ? 'opacity-50 cursor-not-allowed ' : ''
                }${
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
                  {mode.hours}
                </div>
                <div className="text-[11px] text-slate-400 leading-normal">
                  {needsNewFw ? 'Cần nạp Firmware 1.4.0 trở lên cho máy mới dùng được chế độ này' : mode.desc}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3 (che do Tu dat). Gio bat dau + so phut chay, nhap tay */}
      {isCustom && (
        <div className="p-5 rounded-3xl bg-slate-900/80 border border-fuchsia-800/50 space-y-4 animate-in fade-in">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
              3. Giờ lọc và thời gian lọc (tự nhập)
            </label>
            <p className="text-xs text-slate-400 mt-0.5">
              Vào ngày được lọc (chọn ở mục 1), máy chạy một lượt từ giờ bắt đầu, đủ số phút thì nghỉ tới ngày lọc kế.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-slate-400 mb-1">Giờ bắt đầu</label>
              <input
                type="time"
                value={formatHm(cHour, cMin)}
                onChange={(e) => {
                  const [h, m] = e.target.value.split(':').map(Number);
                  if (Number.isFinite(h) && Number.isFinite(m)) {
                    setCHour(Math.min(23, Math.max(0, h)));
                    setCMin(Math.min(59, Math.max(0, m)));
                  }
                }}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 font-mono text-slate-100"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Thời gian lọc (phút)</label>
              <input
                type="number"
                min={1}
                max={1440}
                step={1}
                value={cDur || ''}
                onChange={(e) => setCDur(Math.max(0, Math.round(Number(e.target.value) || 0)))}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 font-mono text-slate-100"
              />
            </div>
          </div>
          {cDurOk ? (
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 text-xs text-slate-300 flex items-start gap-2.5">
              <Info className="w-4 h-4 text-fuchsia-400 shrink-0 mt-0.5" />
              <span>
                Máy lọc từ <strong className="text-cyan-300">{formatHm(cHour, cMin)}</strong> đến{' '}
                <strong className="text-cyan-300">{cEndText}</strong> ({formatMinutes(cDur)}). Máy phải có giờ (gửi giờ điện
                thoại hoặc WiFi nhà) thì lịch này mới chạy.
              </span>
            </div>
          ) : (
            <p className="text-[11px] text-rose-300">Thời gian lọc phải từ 1 đến 1440 phút (24 tiếng).</p>
          )}
        </div>
      )}

      {/* 3. Minutes Per Hour Slider */}
      <div hidden={isCustom} className="p-5 rounded-3xl bg-slate-900/80 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
              3. Thời gian lọc mỗi giờ
            </label>
            <p className="text-xs text-slate-400 mt-0.5">
              Trong khung giờ đã chọn, máy bắt đầu lọc từ đầu giờ (HH:00)
            </p>
          </div>
          <div className="text-right">
            <NumBox value={fmin} min={5} max={60} label="Số phút lọc mỗi giờ" onChange={setFmin} />
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

      {/* 4. Manual Filter Duration */}
      <div className="p-5 rounded-3xl bg-slate-900/80 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
              4. Thời lượng khi bấm &quot;Lọc ngay&quot;
            </label>
            <p className="text-xs text-slate-400 mt-0.5">Số phút bơm chạy cho mỗi lượt lọc thủ công</p>
          </div>
          <div className="text-right">
            <NumBox value={manMin} min={5} max={240} label="Số phút lọc tay" onChange={setManMin} />
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

      {/* 5. Water change schedule (drain - optional) */}
      <div className="p-5 rounded-3xl bg-slate-900/80 border border-slate-800 space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
            5. Thay nước tự động (xả)
          </label>
          <p className="text-xs text-slate-400 mt-0.5">
            Đóng van lọc, mở van xả rồi bơm nước ra ngoài. Xả được ưu tiên hơn lọc; xả xong máy lọc tiếp theo lịch.
            Mỗi lần xả xong máy nghỉ 1 tiếng (hẹn giờ) hoặc số phút bạn đặt (theo TDS) mới xả lại.
          </p>
        </div>
        {config?.drain !== 1 ? (
          <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 text-xs text-slate-400 flex items-start gap-2">
            <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
            <span>Máy chưa bật van xả. Vào tab Kỹ thuật → bật &quot;Có lắp van xả (thay nước)&quot; rồi quay lại đây.</span>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 0, name: 'Hẹn giờ', desc: 'Cứ mấy ngày xả một lần vào giờ cố định' },
                { id: 1, name: 'Theo TDS', desc: 'Nước bẩn (TDS cao) thì tự xả' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setDMode(opt.id)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    dMode === opt.id
                      ? 'bg-orange-950/50 border-orange-500 text-slate-100'
                      : 'bg-slate-950/70 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="text-xs font-bold">{opt.name}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5 leading-snug">{opt.desc}</div>
                </button>
              ))}
            </div>

            {dMode === 1 && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-400 mb-1">Xả khi TDS trên (ppm)</label>
                    <input
                      type="number"
                      min={30}
                      max={2000}
                      step={10}
                      value={tdsHi}
                      onChange={(e) => setTdsHi(Math.round(Number(e.target.value) || 0))}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 font-mono text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Xả tiếp tới khi TDS ≤ (ppm)</label>
                    <input
                      type="number"
                      min={20}
                      max={1990}
                      step={10}
                      value={tdsLo}
                      onChange={(e) => setTdsLo(Math.round(Number(e.target.value) || 0))}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 font-mono text-slate-100"
                    />
                  </div>
                </div>
                <div className="text-xs">
                  <label className="block text-slate-400 mb-1">Hai lần xả cách nhau</label>
                  <div className={`flex items-center gap-1.5 text-slate-400 ${tdsGapSupported ? '' : 'opacity-50 pointer-events-none'}`}>
                    <NumBox
                      value={Math.floor(tdsGap / 60)}
                      min={0}
                      max={24}
                      label="Hai lần xả cách nhau: giờ"
                      tone="text-orange-400"
                      onChange={(h) => setTdsGap(clampTdsGap(h * 60 + (tdsGap % 60)))}
                    />
                    <span>giờ</span>
                    <NumBox
                      value={tdsGap % 60}
                      min={0}
                      max={59}
                      label="Hai lần xả cách nhau: phút"
                      tone="text-orange-400"
                      onChange={(m) => setTdsGap(clampTdsGap(Math.floor(tdsGap / 60) * 60 + m))}
                    />
                    <span>phút</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">Từ 10 phút đến 24 giờ. Mặc định 1 giờ.</p>
                </div>
                <div className="text-xs">
                  <label className="block text-slate-400 mb-1">Xả mấy lần mà TDS không giảm thì dừng</label>
                  <div className={`flex items-center gap-1.5 text-slate-400 ${tdsTrySupported ? '' : 'opacity-50 pointer-events-none'}`}>
                    <NumBox
                      value={tdsTry}
                      min={1}
                      max={20}
                      label="Xả mấy lần mà TDS không giảm thì dừng"
                      tone="text-orange-400"
                      onChange={setTdsTry}
                    />
                    <span>lần</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    {tdsTrySupported
                      ? 'Xả liên tiếp đủ số lần này mà TDS vẫn chưa xuống tới mức dưới thì máy dừng xả và báo E13. Từ 1 đến 20 lần, mặc định 5.'
                      : 'Máy đang chạy firmware cũ: cố định 5 lần. Nạp Firmware 1.5.1 để chỉnh.'}
                  </p>
                  {!tdsGapSupported && (
                    <p className="text-[11px] text-slate-500 mt-1">Máy đang chạy firmware cũ: cố định 2 tiếng. Nạp Firmware 1.5.0 để chỉnh.</p>
                  )}
                </div>
                {!tdsLevelsOk && (
                  <p className="text-[11px] text-rose-300">
                    Mức dưới phải từ 20 ppm, mức trên tối đa 2000 ppm, mức dưới thấp hơn mức trên ít nhất 10 ppm.
                  </p>
                )}
                <p className="text-[11px] text-slate-500">
                  Khi bật chế độ này máy đo TDS liên tục. Mỗi lần xả chạy đúng &quot;Thời gian xả mỗi lần&quot; bên dưới, xong
                  nghỉ {formatMinutes(tdsGap)} rồi xem lại TDS: còn cao hơn mức dưới thì xả tiếp, đạt mức dưới thì ngừng. Xả đủ {tdsTry}
                  lần liên tiếp mà TDS vẫn chưa xuống mức dưới thì máy ngừng xả và báo E13 (Firmware 1.5.0).
                </p>
              </div>
            )}

            {dMode === 0 && (
              <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 space-y-3 text-xs">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-2 text-slate-300">
                  <span>Cứ</span>
                  <NumBox value={dDays} min={1} max={30} label="Số ngày giữa hai lần thay nước" tone="text-orange-400" onChange={setDDays} />
                  <span>ngày thay nước một lần, vào lúc</span>
                  <input
                    type="time"
                    aria-label="Giờ thay nước"
                    value={formatHm(dHour, dMin)}
                    onChange={(e) => {
                      const [h, m] = e.target.value.split(':').map(Number);
                      if (Number.isFinite(h) && Number.isFinite(m)) {
                        setDHour(Math.min(23, Math.max(0, h)));
                        setDMin(Math.min(59, Math.max(0, m)));
                      }
                    }}
                    className="bg-slate-950 border border-slate-700 focus:border-cyan-500 outline-none rounded-xl px-2 py-1 text-xl font-black font-mono text-orange-400"
                  />
                </div>
                <div>
                  <div className="text-slate-400 mb-1.5">Các lần thay nước sắp tới (mỗi lần xả {drainLenText}):</div>
                  <div className="flex flex-wrap gap-1.5">
                    {upcomingDrains.map((at) => {
                      const d = new Date(at * 1000);
                      return (
                        <span
                          key={at}
                          className="px-2.5 py-1 rounded-lg bg-orange-950/40 border border-orange-800/50 text-orange-200 font-mono"
                        >
                          {WEEKDAYS[d.getUTCDay()].label} {d.getUTCDate()}/{d.getUTCMonth() + 1} · {formatLocalHm(at)}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300">Thời gian xả mỗi lần (tự động)</span>
                <span className="flex items-center gap-1.5 text-slate-400">
                  <NumBox
                    value={Math.floor(dSec / 60)}
                    min={0}
                    max={30}
                    label="Thời gian xả: phút"
                    tone="text-orange-400"
                    onChange={(m) => setDSec(clampDSec(m * 60 + (dSec % 60)))}
                  />
                  <span>phút</span>
                  <NumBox
                    value={dSec % 60}
                    min={0}
                    max={59}
                    label="Thời gian xả: giây"
                    tone="text-orange-400"
                    onChange={(s) => setDSec(clampDSec(Math.floor(dSec / 60) * 60 + s))}
                  />
                  <span>giây</span>
                </span>
              </div>
              <input
                type="range"
                min={5}
                max={1800}
                step={5}
                value={dSec}
                onChange={(e) => setDSec(Number(e.target.value))}
                className="w-full accent-orange-500 cursor-pointer h-2 bg-slate-950 rounded-lg"
              />
              <div className="flex justify-between text-[10px] font-mono text-slate-500">
                <span>5 s</span>
                <span>5 ph</span>
                <span>15 ph</span>
                <span>30 ph</span>
              </div>
            </div>
            <div className="pt-3 border-t border-slate-800 text-xs space-y-1.5">
              <div className="text-slate-300">Thay nước tay (nút &quot;Thay nước ngay&quot;): cảnh báo khi xả liên tục quá</div>
              <div className={`flex items-center gap-1.5 text-slate-400 ${dWarnSupported ? '' : 'opacity-50 pointer-events-none'}`}>
                <NumBox
                  value={Math.floor(dWarn / 60)}
                  min={0}
                  max={24}
                  label="Cảnh báo xả tay: giờ"
                  tone="text-orange-400"
                  onChange={(h) => setDWarn(clampDWarn(h * 60 + (dWarn % 60)))}
                />
                <span>giờ</span>
                <NumBox
                  value={dWarn % 60}
                  min={0}
                  max={59}
                  label="Cảnh báo xả tay: phút"
                  tone="text-orange-400"
                  onChange={(m) => setDWarn(clampDWarn(Math.floor(dWarn / 60) * 60 + m))}
                />
                <span>phút</span>
              </div>
              <p className="text-[11px] text-slate-500">
                {dWarnSupported
                  ? 'Xả tay không giới hạn thời gian: máy xả tới khi bạn bấm "Dừng xả". Quá thời gian này máy báo E14 nhưng vẫn xả tiếp. Từ 5 phút đến 24 giờ, mặc định 1 giờ.'
                  : 'Máy đang chạy firmware cũ: xả tay cũng tự dừng sau "Thời gian xả mỗi lần". Nạp Firmware 1.6.0 để xả tay không giới hạn.'}
              </p>
            </div>
            {dMode === 0 && (
              <p className="text-[11px] text-slate-500">
                Ngày xả tính theo số ngày liên tục (giống máy), nên lần đầu có thể không phải hôm nay. Máy chưa có giờ thì
                không tự xả; đến giờ mà máy đang tắt / lỗi / vừa xả chưa đủ 1 tiếng thì bỏ lượt đó.
              </p>
            )}
          </>
        )}
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
