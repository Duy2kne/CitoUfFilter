/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Calendar,
  Clock,
  Droplet,
  Filter,
  Gauge,
  Hand,
  Play,
  Power,
  RefreshCw,
  Square,
  Thermometer,
  Zap,
} from 'lucide-react';
import {
  assessCurrent,
  CurrentAssessment,
  FILTER_MODES,
  formatHm,
  formatCurrent,
  drainGapSeconds,
  isSensorRealtime,
  tdsMaxTries,
  formatDuration,
  formatLocalHm,
  formatMinutes,
  formatTdsAge,
  isLockedFault,
  parseErrors,
  UfConfig,
  UfStatus,
} from '../types/system';

interface HomeTabProps {
  status: UfStatus | null;
  config: UfConfig | null;
  onSendCommand: (action: string, params?: Record<string, unknown>) => Promise<unknown>;
  onNavigateTab: (tabId: 'schedule' | 'history' | 'tech') => void;
  onRequestConfirm: (title: string, message: string, onConfirm: () => void, isDangerous?: boolean) => void;
}

// Tron 2 mau '#rrggbb' (k = 0 -> a, 1 -> b) - de vong tien do doi mau dan toi mau "xong"
function mixHex(a: string, b: string, k: number): string {
  const t = Math.min(1, Math.max(0, k));
  const ch = (s: string, i: number) => parseInt(s.slice(1 + i * 2, 3 + i * 2), 16);
  return (
    '#' +
    [0, 1, 2]
      .map((i) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t).toString(16).padStart(2, '0'))
      .join('')
  );
}

// Cac muc thoi gian loc tay chon nhanh (phut) - firmware nhan 5..240
const MANUAL_PRESETS = [5, 15, 30, 60, 120];

const TONE_TEXT: Record<CurrentAssessment['tone'], string> = {
  slate: 'text-slate-400',
  emerald: 'text-emerald-400',
  amber: 'text-amber-400',
  rose: 'text-rose-400',
};
const TONE_BAR: Record<CurrentAssessment['tone'], string> = {
  slate: 'bg-slate-600',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
};

interface Mark {
  at: number;
  label: string;
  color: string;
}

/** 1 dong "thiet bi": ten, dang bat / tat, so mA lon, danh gia, thanh do co vach nguong */
const DeviceCurrentRow: React.FC<{
  icon: React.ReactNode;
  name: string;
  onText: string;
  offText: string;
  on: boolean;
  mA: number;
  assess: CurrentAssessment;
  marks: Mark[];
  hint?: string;
}> = ({ icon, name, onText, offText, on, mA, assess, marks, hint }) => {
  const top = Math.max(100, ...marks.map((m) => m.at));
  const scale = top * 1.2;
  const pct = Math.min(100, Math.max(0, (mA / scale) * 100));
  const noSensor = assess.level === 'nosensor';

  return (
    <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center shrink-0">
            {icon}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-slate-100 truncate">{name}</div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${on ? 'bg-cyan-400 shadow-[0_0_6px_#22d3ee]' : 'bg-slate-600'}`}
              />
              <span className={`text-[11px] font-semibold ${on ? 'text-cyan-300' : 'text-slate-400'}`}>
                {on ? onText : offText}
              </span>
            </div>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="flex items-baseline justify-end gap-1">
            <span className="text-2xl font-black font-mono text-white tabular-nums">
              {noSensor ? '—' : mA < 1000 ? Math.max(0, Math.round(mA)) : (mA / 1000).toFixed(2)}
            </span>
            <span className="text-xs font-semibold text-slate-400">{mA < 1000 ? 'mA' : 'A'}</span>
          </div>
          <div className={`text-[11px] font-semibold ${TONE_TEXT[assess.tone]}`}>{assess.label}</div>
        </div>
      </div>

      {/* Thanh do: vach = nguong bao ve dang cai tren may */}
      {!noSensor && (
        <div className="mt-3">
          <div className="relative h-2.5 rounded-full bg-slate-800">
            <div
              className={`h-full rounded-full transition-all duration-700 ${TONE_BAR[assess.tone]}`}
              style={{ width: `${pct}%` }}
            />
            {marks.map((m) => (
              <div
                key={m.label}
                className={`absolute -top-1 -bottom-1 w-0.5 rounded ${m.color}`}
                style={{ left: `${Math.min(100, (m.at / scale) * 100)}%` }}
              />
            ))}
          </div>
          <div className="relative h-4 mt-1">
            {marks.map((m) => (
              <span
                key={m.label}
                className="absolute -translate-x-1/2 text-[9px] font-mono text-slate-500 whitespace-nowrap"
                style={{ left: `${Math.min(94, Math.max(6, (m.at / scale) * 100))}%` }}
              >
                {m.label} {m.at}
              </span>
            ))}
          </div>
        </div>
      )}
      {hint && <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">{hint}</p>}
    </div>
  );
};

export const HomeTab: React.FC<HomeTabProps> = ({
  status,
  config,
  onSendCommand,
  onNavigateTab,
  onRequestConfirm,
}) => {
  // Local 1-second tick for smooth countdowns between packets
  const [localNext, setLocalNext] = useState<number>(-1);
  const [localRunLeft, setLocalRunLeft] = useState<number>(0);
  const [busy, setBusy] = useState<string>(''); // Lenh dang cho may tra loi

  useEffect(() => {
    if (!status) return;
    setLocalNext(status.next);
    setLocalRunLeft(status.run.left);
  }, [status?.next, status?.run.left]);

  useEffect(() => {
    const timer = setInterval(() => {
      setLocalNext((prev) => (prev > 0 ? prev - 1 : prev));
      setLocalRunLeft((prev) => (prev > 0 ? prev - 1 : prev));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const send = async (key: string, action: string, params?: Record<string, unknown>) => {
    try {
      setBusy(key);
      await onSendCommand(action, params);
    } finally {
      setBusy('');
    }
  };

  const isPowerOn = status ? status.pw === 1 : false;
  const isDraining = status ? status.st === 6 : false;
  // Bom dang chay 1 luot co tien do (loc lich / loc tay / thay nuoc)
  const isFiltering = status ? status.st === 2 || status.st === 3 || status.st === 6 : false;
  const isScheduled = status ? status.st === 2 : false;
  const isManual = status ? status.man === 1 : false;
  const isMeasuring = status ? status.st === 4 : false;
  const isFault = status ? status.st === 5 : false;

  const currentMode = config ? FILTER_MODES.find((m) => m.id === config.fmode) : undefined;

  const activeErrors = status ? parseErrors(status.err, status.wrn) : [];
  const hasLockError = status ? isLockedFault(status.err) : false;
  const hasValve = (config?.valve ?? 0) === 1 || (status?.v?.[0] ?? 0) === 1;
  const hasDrainValve = (config?.drain ?? 0) === 1 || (status?.d?.[0] ?? 0) === 1;
  const drainCooldown = status?.dcool ?? 0;
  const tdsRun = config?.tds_run ?? 10; // Giay bom chay de do TDS
  const manualMin = config?.man_min ?? 30;
  const drainSec = config?.d_sec ?? 60;

  // Vi sao cac nut dieu khien bi khoa (hien ngay duoi nut de khach khoi doan)
  const blockReason = !status
    ? 'Chưa kết nối máy – bấm Kết nối ở góc trên.'
    : !isPowerOn
    ? 'Máy đang tắt – bấm "Bật máy" trước khi lọc / thay nước.'
    : hasLockError
    ? 'Máy đang khóa an toàn vì lỗi – kiểm tra bơm / van rồi bấm "Xóa lỗi".'
    : '';
  const canRun = !blockReason;

  // Circular gauge calculations: vong chay theo phan DA chay cua luot (giong man hinh may)
  const totalRunSecs = status?.run.tot || (config?.fmin ? config.fmin * 60 : 1800);
  const remainingSecs = Math.max(0, localRunLeft);
  // Loc tay: vong sang day ngay, chi con 1 vet sang chay quanh (thoi gian con lai xem o dong "Còn ...")
  const isManualRun = status ? status.st === 3 : false;
  const progressRatio = isManualRun
    ? 1
    : isFiltering && totalRunSecs > 0
    ? Math.min(1, Math.max(0, 1 - remainingSecs / totalRunSecs))
    : 0;

  // SVG parameters
  const size = 260;
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  // Use a 270-degree arc with bottom gap for gauge look
  const arcLength = circumference * 0.75;
  const strokeDashoffset = isFiltering ? arcLength * (1 - progressRatio) : arcLength;
  // Mau vong (giong man hinh may): dau vong = mau trang thai, cang gan du thoi gian cang ngả sang mau "xong"
  // loc: xanh duong -> xanh la; thay nuoc: cam -> vang
  const ringStart = isDraining ? '#f97316' : '#06b6d4';
  const ringEnd = isManualRun
    ? '#3b82f6'
    : mixHex(isDraining ? '#fb923c' : '#3b82f6', isDraining ? '#facc15' : '#22c55e', progressRatio);
  const chasePeriod = circumference; // 1 vet sang chay het vong (khe ho phia duoi bi che boi mask)

  // Status display texts & colors
  const getStatusTextAndStyle = () => {
    if (!status) {
      return { text: 'Chờ kết nối máy…', color: 'text-slate-400', glow: 'from-slate-600/20 to-transparent' };
    }
    if (status.pw === 0) {
      return { text: 'Máy đã tắt', color: 'text-slate-400', glow: 'from-slate-800/40 to-transparent' };
    }
    if (isFault) {
      return { text: 'LỖI – Đã khóa an toàn', color: 'text-rose-400', glow: 'from-rose-600/30 to-transparent' };
    }
    if (isMeasuring) {
      return { text: 'Đang đo TDS nước…', color: 'text-purple-400', glow: 'from-purple-600/30 to-transparent' };
    }
    if (isDraining) {
      return { text: 'Đang thay nước (xả)', color: 'text-orange-400', glow: 'from-orange-600/30 to-transparent' };
    }
    if (status.st === 3) {
      return { text: 'Đang lọc tay', color: 'text-blue-400', glow: 'from-blue-600/30 to-transparent' };
    }
    if (status.st === 2) {
      return { text: 'Đang lọc theo lịch', color: 'text-cyan-400', glow: 'from-cyan-600/30 to-transparent' };
    }
    return { text: 'Đang nghỉ – chờ lượt tới', color: 'text-emerald-400', glow: 'from-emerald-600/20 to-transparent' };
  };

  const statusStyle = getStatusTextAndStyle();

  const handleTogglePower = () => {
    if (!status) {
      onSendCommand('POWER', { on: true }); // Chua ket noi -> App mo hop thoai ket noi
      return;
    }
    if (status.pw === 1) {
      onRequestConfirm(
        'Tắt máy lọc nước?',
        'Máy sẽ dừng toàn bộ chu trình lọc tự động và ngắt bơm. Bạn có chắc chắn muốn tắt?',
        () => send('power', 'POWER', { on: false }),
        true
      );
    } else {
      // Power on clears locks
      send('power', 'POWER', { on: true });
    }
  };

  const handleToggleFilter = () => send('filter', 'FILTER', { on: !isManual });

  const handleSetManualMin = (min: number) => {
    if (min === manualMin) return;
    send('man_min', 'SET', { man_min: min });
  };

  const handleMeasureTds = () => send('measure', 'MEASURE');

  const handleClearFaults = () => send('clear', 'CLEAR_FAULTS');

  const handleToggleDrain = () => {
    if (!status) return;
    if (isDraining) {
      send('drain', 'DRAIN', { on: false });
      return;
    }
    onRequestConfirm(
      'Thay nước ngay?',
      `Máy sẽ đóng van lọc, mở van xả và bơm nước ra ngoài trong ${formatDuration(drainSec)}. Sau khi xả xong phải chờ ${formatMinutes(drainGapSeconds(config?.d_mode, config?.tds_gap) / 60)} mới xả lại được. Tiếp tục?`,
      () => send('drain', 'DRAIN', { on: true })
    );
  };

  const handleFilterReset = () => {
    onRequestConfirm(
      'Đã thay lõi lọc mới?',
      'Máy sẽ quên dòng bơm lúc lõi sạch cũ và học lại ở lượt lọc sau (độ sạch tạm hiện "chưa biết").',
      () => send('reset', 'FILTER_RESET')
    );
  };

  // Do sach loi loc: xanh >= 50 %, vang 20-50 %, do < 20 %
  const fcl = status?.fcl ?? -1;
  const fclColor = fcl < 0 ? 'bg-slate-700' : fcl >= 50 ? 'bg-emerald-500' : fcl >= 20 ? 'bg-amber-500' : 'bg-rose-500';

  const handleSyncTime = () => {
    const localEpochSeconds = Math.floor(Date.now() / 1000 - new Date().getTimezoneOffset() * 60);
    send('time', 'TIME_SET', { t: localEpochSeconds });
  };

  // ----- Dong dien tung thiet bi (so voi nguong dang cai tren may) -----
  const pMin = config?.p_min ?? 40;
  const pDirty = config?.p_dirty ?? 0;
  const pBlock = config?.p_block ?? 1200;
  const pumpOn = status?.p[0] === 1;
  const pumpMa = status?.p[2] ?? 0;
  const pumpAssess = assessCurrent(pumpOn, status ? status.p[1] === 1 : true, pumpMa, pMin, pBlock, pDirty);
  const pumpHint =
    pumpAssess.level === 'low'
      ? 'Bơm được cấp điện nhưng gần như không ăn dòng: kiểm tra dây bơm, giắc cắm, bơm kẹt rác hoặc hồ cạn nước.'
      : pumpAssess.level === 'high'
      ? 'Dòng lúc này cao hơn mức lõi bẩn. Máy chỉ kết luận lõi bẩn (E3) khi lượt lọc kết thúc, theo dòng trung bình cả lượt.'
      : pumpAssess.level === 'over'
      ? 'Dòng vượt mức ngắt khẩn cấp: bơm kẹt cánh hoặc chập dây. Máy sẽ tự khóa.'
      : pumpAssess.level === 'stuck'
      ? 'Máy đã tắt bơm nhưng vẫn đo thấy dòng – mạch công suất có thể hỏng, hãy báo kỹ thuật.'
      : pumpAssess.level === 'nosensor'
      ? 'Bơm vẫn chạy được nhưng máy không bảo vệ quá dòng. Kiểm tra giắc cảm biến dòng.'
      : undefined;
  const pumpMarks: Mark[] = [
    { at: pMin, label: 'min', color: 'bg-slate-400' },
    ...(pDirty > 0 ? [{ at: pDirty, label: 'bẩn', color: 'bg-amber-400' }] : []),
    { at: pBlock, label: 'ngắt', color: 'bg-rose-500' },
  ];

  const valveOn = status?.v[1] === 1;
  const valveMa = status?.v[3] ?? 0;
  const vMin = config?.v_min ?? 50;
  const vMax = config?.v_max ?? 1000;
  const valveAssess = assessCurrent(valveOn, status ? status.v[2] === 1 : true, valveMa, vMin, vMax);

  const drainOn = status?.d[1] === 1;
  const drainMa = status?.d[3] ?? 0;
  const dMin = config?.d_vmin ?? 50;
  const dMax = config?.d_vmax ?? 1000;
  const drainAssess = assessCurrent(drainOn, status ? status.d[2] === 1 : true, drainMa, dMin, dMax);

  const valveHint = (a: CurrentAssessment, what: string) =>
    a.level === 'low'
      ? `${what} được cấp điện nhưng không ăn dòng: kiểm tra dây và cuộn hút của van.`
      : a.level === 'over'
      ? `${what} ăn dòng quá lớn: cuộn hút chập hoặc kẹt. Máy sẽ tự khóa.`
      : undefined;

  const totalMa = pumpMa + (hasValve ? valveMa : 0) + (hasDrainValve ? drainMa : 0);
  const manualChips = MANUAL_PRESETS.includes(manualMin)
    ? MANUAL_PRESETS
    : [...MANUAL_PRESETS, manualMin].sort((a, b) => a - b);

  const bigBtn =
    'flex flex-col items-center justify-center gap-1 min-h-[76px] py-3 px-3 rounded-2xl font-semibold text-sm border shadow-lg transition-all active:scale-[0.98] disabled:cursor-not-allowed';
  const offBtn = 'bg-slate-900/50 text-slate-500 border-slate-800 shadow-none';
  const drainBlocked = !canRun || !hasDrainValve || (!isDraining && drainCooldown > 0);

  return (
    <div className="space-y-5 pb-8 animate-in fade-in duration-200">
      {/* Active Fault Alert Banner (if any) */}
      {activeErrors.length > 0 && (
        <div className="space-y-2">
          {activeErrors.map((err) => (
            <div
              key={err.code}
              className={`p-4 rounded-2xl border backdrop-blur-md transition-all ${
                err.isLocking
                  ? 'bg-rose-950/70 border-rose-600/50 text-rose-200 shadow-lg shadow-rose-950/50'
                  : err.isWarning
                  ? 'bg-amber-950/60 border-amber-600/40 text-amber-200'
                  : 'bg-blue-950/60 border-blue-600/40 text-blue-200'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                      err.isLocking ? 'bg-rose-900/80 text-rose-300' : 'bg-amber-900/80 text-amber-300'
                    }`}
                  >
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-sm tracking-wide text-white">
                        {err.code}: {err.name}
                      </span>
                      {err.isWarning && (
                        <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          Máy vẫn lọc
                        </span>
                      )}
                      {err.isLocking && (
                        <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-rose-500/30 text-rose-200 border border-rose-500/40">
                          Khóa an toàn
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-300 mt-1 leading-relaxed">{err.hint}</p>
                  </div>
                </div>

                {/* Inline Action for Specific Error */}
                <div className="shrink-0 pt-0.5">
                  {['E1', 'E2', 'E5', 'E6', 'E11', 'E12', 'E13'].includes(err.code) && (
                    <button
                      onClick={handleClearFaults}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-xl shadow-sm transition-all"
                    >
                      Xóa lỗi
                    </button>
                  )}
                  {err.code === 'E9' && (
                    <button
                      onClick={handleSyncTime}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-500 rounded-xl shadow-sm transition-all"
                    >
                      Gửi giờ điện thoại
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Main Interactive Circular Progress Ring */}
      <div className="relative rounded-3xl bg-gradient-to-b from-slate-900/90 to-slate-950/90 border border-slate-800/80 p-5 flex flex-col items-center justify-center shadow-2xl overflow-hidden">
        {/* Ambient Back Glow */}
        <div
          className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 rounded-full bg-gradient-to-b ${statusStyle.glow} blur-3xl pointer-events-none -z-0`}
        />

        <div className="relative z-10 w-full max-w-[250px] aspect-square flex items-center justify-center">
          <svg className="w-full h-full rotate-[135deg]" viewBox={`0 0 ${size} ${size}`}>
            {/* Background Arc Track */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="#1e293b"
              strokeWidth={strokeWidth}
              strokeDasharray={`${arcLength} ${circumference}`}
              strokeLinecap="round"
            />
            {/* Active Progress Arc */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="url(#progressGradient)"
              strokeWidth={strokeWidth + 2}
              strokeDasharray={`${arcLength} ${circumference}`}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              className="transition-all duration-1000 ease-linear"
            />
            {/* Loc tay: 1 vet sang chay quanh vong da day */}
            {isManualRun && (
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke="#ecfeff"
                strokeOpacity={0.85}
                strokeWidth={strokeWidth - 4}
                strokeDasharray={`${chasePeriod * 0.12} ${chasePeriod * 0.88}`}
                strokeLinecap="round"
                mask="url(#ringArcMask)"
              >
                <animate attributeName="stroke-dashoffset" from="0" to={-chasePeriod} dur="2.4s" repeatCount="indefinite" />
              </circle>
            )}
            <defs>
              <mask id="ringArcMask" maskUnits="userSpaceOnUse" x={0} y={0} width={size} height={size}>
                <circle
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke="#fff"
                  strokeWidth={strokeWidth + 2}
                  strokeDasharray={`${arcLength} ${circumference}`}
                  strokeLinecap="round"
                />
              </mask>
              <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={ringStart} />
                <stop offset="100%" stopColor={ringEnd} />
              </linearGradient>
            </defs>
          </svg>

          {/* Center Info Cluster */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center mb-1 transition-all ${
                isFiltering
                  ? 'bg-cyan-500/20 text-cyan-400 shadow-md shadow-cyan-500/20 animate-bounce'
                  : 'bg-slate-800/80 text-slate-400'
              }`}
            >
              <Droplet className="w-5 h-5" />
            </div>

            {/* Status text */}
            <div className={`text-xs font-semibold tracking-wide uppercase mb-1.5 ${statusStyle.color}`}>
              {statusStyle.text}
            </div>

            {/* Giant TDS Number */}
            <div className="flex items-baseline justify-center gap-1.5 my-0.5">
              <span className="text-5xl font-black tracking-tight text-white font-mono drop-shadow-[0_2px_12px_rgba(6,182,212,0.3)]">
                {status?.tds !== null && status?.tds !== undefined ? status.tds : '—'}
              </span>
              <span className="text-sm font-semibold text-cyan-400 uppercase tracking-wider">ppm</span>
            </div>

            <span className="text-[11px] text-slate-400 mt-1">
              {status ? `TDS · ${formatTdsAge(status.tds_age)}` : 'Chưa có dữ liệu'}
            </span>
            {isFiltering && (
              <span className="text-[11px] font-mono font-semibold text-cyan-300 mt-1">
                Còn {formatDuration(remainingSecs)}
              </span>
            )}
          </div>

          {/* Scale labels at arc endpoints */}
          <div className="absolute bottom-3 left-5 text-[10px] font-mono text-slate-500">0 ph</div>
          <div className="absolute bottom-3 right-5 text-[10px] font-mono text-slate-500">
            {isFiltering ? Math.max(1, Math.round(totalRunSecs / 60)) : (config?.fmode === 5 && config.c_dur) || config?.fmin || 30} ph
          </div>
        </div>
      </div>

      {/* ================= DIEU KHIEN BANG TAY ================= */}
      <section className="rounded-3xl bg-slate-900/80 border border-slate-800 p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <Hand className="w-4 h-4 text-cyan-400" />
            Điều khiển bằng tay
          </h2>
          <span className={`text-[11px] font-semibold text-right ${statusStyle.color}`}>{statusStyle.text}</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Bat / tat may */}
          <button
            onClick={handleTogglePower}
            disabled={busy === 'power'}
            className={`${bigBtn} ${
              isPowerOn
                ? 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-700/80 shadow-slate-950/40'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400/40 shadow-emerald-950/50'
            }`}
          >
            <span className="flex items-center gap-2">
              <Power className={`w-4 h-4 ${isPowerOn ? 'text-rose-400' : 'text-white'}`} />
              {isPowerOn ? 'Tắt máy' : 'Bật máy'}
            </span>
            <span className={`text-[11px] font-normal ${isPowerOn ? 'text-slate-400' : 'text-emerald-100'}`}>
              {isPowerOn ? 'Máy đang bật' : status ? 'Máy đang tắt' : 'Chưa kết nối'}
            </span>
          </button>

          {/* Loc tay */}
          <button
            onClick={handleToggleFilter}
            disabled={!canRun || busy === 'filter'}
            className={`${bigBtn} ${
              !canRun
                ? offBtn
                : isManual
                ? 'bg-rose-600 hover:bg-rose-500 text-white border-rose-400/40 shadow-rose-950/50'
                : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white border-cyan-400/30 shadow-cyan-950/60'
            }`}
          >
            <span className="flex items-center gap-2">
              {isManual ? <Square className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
              {isManual ? 'Dừng lọc tay' : 'Lọc ngay'}
            </span>
            <span className="text-[11px] font-normal opacity-90">
              {isManual && status?.st === 3
                ? `Còn ${formatDuration(remainingSecs)}`
                : isManual
                ? 'Đang chờ chạy'
                : `Chạy ${manualMin} phút rồi tự dừng`}
            </span>
          </button>

          {/* Thay nuoc (xa) */}
          <button
            onClick={handleToggleDrain}
            disabled={drainBlocked || busy === 'drain'}
            className={`${bigBtn} ${
              drainBlocked
                ? offBtn
                : isDraining
                ? 'bg-rose-600 hover:bg-rose-500 text-white border-rose-400/40 shadow-rose-950/50'
                : 'bg-orange-600 hover:bg-orange-500 text-white border-orange-400/40 shadow-orange-950/50'
            }`}
          >
            <span className="flex items-center gap-2">
              <RefreshCw className={`w-4 h-4 ${isDraining ? 'animate-spin' : ''}`} />
              {isDraining ? 'Dừng xả' : 'Thay nước ngay'}
            </span>
            <span className="text-[11px] font-normal opacity-90">
              {!hasDrainValve
                ? 'Máy chưa lắp van xả'
                : isDraining
                ? `Còn ${formatDuration(status?.dleft ?? 0)}`
                : drainCooldown > 0
                ? `Vừa xả – chờ ${Math.ceil(drainCooldown / 60)} phút`
                : `Xả ${formatDuration(drainSec)} rồi tự dừng`}
            </span>
          </button>

          {/* Do TDS + nhiet do ngay */}
          <button
            onClick={handleMeasureTds}
            disabled={!canRun || isDraining || isMeasuring || busy === 'measure'}
            className={`${bigBtn} ${
              !canRun || isDraining
                ? offBtn
                : 'bg-purple-700 hover:bg-purple-600 text-white border-purple-400/40 shadow-purple-950/50'
            }`}
          >
            <span className="flex items-center gap-2">
              <Gauge className="w-4 h-4" />
              {isMeasuring ? 'Đang đo…' : 'Đo TDS ngay'}
            </span>
            <span className="text-[11px] font-normal opacity-90">
              {isDraining ? 'Chờ xả xong' : pumpOn ? `Cập nhật sau ${tdsRun} giây` : `Chạy bơm ${tdsRun} giây để đo`}
            </span>
          </button>
        </div>

        {blockReason && (
          <div className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-amber-950/40 border border-amber-700/40 text-xs text-amber-200">
            <span>{blockReason}</span>
            {status && hasLockError && (
              <button
                onClick={handleClearFaults}
                className="shrink-0 px-3 py-1.5 font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-xl"
              >
                Xóa lỗi
              </button>
            )}
          </div>
        )}

        {/* Thoi gian moi lan bam "Loc ngay" */}
        <div>
          <div className="text-[11px] text-slate-400 mb-1.5">Mỗi lần bấm &quot;Lọc ngay&quot; chạy bao lâu:</div>
          <div className="flex flex-wrap gap-2">
            {manualChips.map((m) => (
              <button
                key={m}
                onClick={() => handleSetManualMin(m)}
                disabled={!status || busy === 'man_min'}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all disabled:opacity-50 ${
                  m === manualMin
                    ? 'bg-cyan-600 border-cyan-400 text-white'
                    : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-600'
                }`}
              >
                {m >= 60 && m % 60 === 0 ? `${m / 60} giờ` : `${m} phút`}
              </button>
            ))}
          </div>
          {isManual && (
            <p className="text-[11px] text-slate-500 mt-1.5">Đổi thời gian lúc đang lọc tay sẽ áp dụng từ lần bấm sau.</p>
          )}
          {isScheduled && !isManual && (
            <p className="text-[11px] text-slate-500 mt-1.5">
              Máy đang lọc theo lịch. Muốn dừng hẳn bơm, bấm &quot;Tắt máy&quot;.
            </p>
          )}
        </div>
      </section>

      {/* ================= DONG DIEN BOM & VAN ================= */}
      <section className="rounded-3xl bg-slate-900/80 border border-slate-800 p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" />
            Dòng điện bơm &amp; van
          </h2>
          <button
            onClick={() => onNavigateTab('tech')}
            className="text-[11px] font-semibold text-cyan-300 hover:text-cyan-200"
          >
            Chỉnh ngưỡng →
          </button>
        </div>

        <div className={`grid grid-cols-1 gap-3 ${hasValve || hasDrainValve ? 'md:grid-cols-2' : ''}`}>
          <DeviceCurrentRow
            icon={<Zap className="w-4 h-4 text-cyan-400" />}
            name={config ? `Bơm lọc (${config.ptype === 1 ? 'bơm lớn' : 'bơm nhỏ'})` : 'Bơm lọc'}
            onText="Đang chạy"
            offText="Đang tắt"
            on={pumpOn}
            mA={pumpMa}
            assess={pumpAssess}
            marks={pumpMarks}
            hint={pumpHint}
          />
          {hasValve && (
            <DeviceCurrentRow
              icon={<Droplet className="w-4 h-4 text-blue-400" />}
              name="Van lọc"
              onText="Đang mở"
              offText="Đang đóng"
              on={valveOn}
              mA={valveMa}
              assess={valveAssess}
              marks={[
                { at: vMin, label: 'min', color: 'bg-slate-400' },
                { at: vMax, label: 'ngắt', color: 'bg-rose-500' },
              ]}
              hint={valveHint(valveAssess, 'Van lọc')}
            />
          )}
          {hasDrainValve && (
            <DeviceCurrentRow
              icon={<RefreshCw className="w-4 h-4 text-orange-400" />}
              name="Van xả (thay nước)"
              onText="Đang mở"
              offText="Đang đóng"
              on={drainOn}
              mA={drainMa}
              assess={drainAssess}
              marks={[
                { at: dMin, label: 'min', color: 'bg-slate-400' },
                { at: dMax, label: 'ngắt', color: 'bg-rose-500' },
              ]}
              hint={valveHint(drainAssess, 'Van xả')}
            />
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
            <div className="text-[10px] text-slate-400">Tổng dòng</div>
            <div className="text-sm font-bold font-mono text-slate-100">{status ? formatCurrent(totalMa) : '—'}</div>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
            <div className="text-[10px] text-slate-400">Công suất (ước tính)</div>
            <div className="text-sm font-bold font-mono text-slate-100">{status ? `${status.wt.toFixed(1)} W` : '—'}</div>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
            <div className="text-[10px] text-slate-400">Điện 30 ngày</div>
            <div className="text-sm font-bold font-mono text-slate-100">
              {status
                ? status.kwh < 1
                  ? `${Math.round(status.kwh * 1000)} Wh`
                  : `${status.kwh.toFixed(2)} kWh`
                : '—'}
            </div>
          </div>
        </div>
        <p className="text-[11px] text-slate-500 leading-relaxed">
          Vạch trên thanh là ngưỡng bảo vệ đang cài: dưới &quot;min&quot; khi đang chạy là không có tải, trên &quot;ngắt&quot; máy
          dừng khẩn cấp{pDirty > 0 ? ', dòng trung bình cả lượt trên "bẩn" là lõi lọc nghẹt' : ''}. Công suất tính theo nguồn {status?.vn ?? 12} V danh định.
        </p>
      </section>

      {/* Lich loc + luot ke */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        {/* Current Filter Mode */}
        <button
          onClick={() => onNavigateTab('schedule')}
          className="text-left p-4 rounded-2xl bg-slate-900/80 hover:bg-slate-900 border border-slate-800/80 hover:border-slate-700 transition-all group flex items-start gap-3"
        >
          <div className="w-10 h-10 rounded-xl bg-cyan-950/70 border border-cyan-800/50 text-cyan-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-medium">Lịch lọc tự động</div>
            <div className="text-sm font-bold text-slate-100 flex flex-wrap items-center gap-1.5 mt-0.5">
              <span>{currentMode?.name || '—'}</span>
              {currentMode && <span className="text-xs font-normal text-cyan-300">· {currentMode.hours}</span>}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              {config
                ? config.fmode === 0
                  ? 'Không tự chạy – chạm để chọn lịch →'
                  : config.fmode === 5
                  ? `Lọc ${config.c_dur} phút từ ${formatHm(config.c_hour, config.c_min)} – chạm để đổi →`
                  : `Lọc ${config.fmin} phút mỗi giờ – chạm để đổi →`
                : 'Chạm để đổi lịch lọc →'}
            </div>
          </div>
        </button>

        {/* Next Run / Remaining Time */}
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800/80 flex items-start gap-3">
          <div
            className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${
              isFiltering
                ? 'bg-blue-950/70 border-blue-800/50 text-blue-400'
                : 'bg-slate-800/70 border-slate-700/60 text-slate-400'
            }`}
          >
            <Clock className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs text-slate-400 font-medium">
              {isDraining ? 'Thay nước còn lại' : isFiltering ? 'Lượt lọc này còn' : 'Lần lọc tiếp theo'}
            </div>

            {isFiltering ? (
              <div>
                <div className="text-sm font-bold text-cyan-300 font-mono mt-0.5">{formatDuration(remainingSecs)}</div>
                <div className="text-[11px] text-slate-400 mt-1">Tổng thời gian lượt: {formatDuration(totalRunSecs)}</div>
              </div>
            ) : localNext > 0 ? (
              <div>
                <div className="text-sm font-bold text-slate-100 font-mono mt-0.5 flex items-center gap-1.5">
                  <span>Sau {formatDuration(localNext)}</span>
                  {status?.next_t && status.next_t > 0 ? (
                    <span className="text-xs font-normal text-emerald-400">(lúc {formatLocalHm(status.next_t)})</span>
                  ) : null}
                </div>
                <div className="text-[11px] text-emerald-400/80 mt-1">
                  {status?.tk === 1 ? 'Máy đang nghỉ, tự chạy khi tới giờ' : 'Máy chưa có giờ – đang chạy theo chu kỳ 60 phút'}
                </div>
              </div>
            ) : (
              <div>
                <div className="text-sm font-bold text-slate-400 mt-0.5">—</div>
                <div className="text-[11px] text-slate-400 mt-1">
                  {!status
                    ? 'Chưa kết nối'
                    : !isPowerOn
                    ? 'Máy đang tắt'
                    : config?.fmode === 0
                    ? 'Chế độ thủ công – chỉ lọc khi bấm "Lọc ngay"'
                    : hasLockError
                    ? 'Đang có lỗi khóa máy'
                    : config?.fmode === 5 && status.tk !== 1
                    ? 'Máy chưa có giờ – gửi giờ điện thoại thì lịch tự đặt mới chạy'
                    : 'Chưa có lịch'}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Loi loc + Thay nuoc tu dong */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        {/* Do sach loi loc (theo dong bom) */}
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800/80">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
              <Filter className="w-4 h-4 text-cyan-400" />
              <span>Độ sạch lõi lọc</span>
              <span className="text-[10px] text-slate-500">· cập nhật sau mỗi lượt lọc</span>
            </div>
            <span className="text-lg font-black font-mono text-slate-100">{fcl < 0 ? '—' : `${fcl}%`}</span>
          </div>
          <div className="mt-2 h-2.5 rounded-full bg-slate-800 overflow-hidden">
            <div className={`h-full rounded-full transition-all ${fclColor}`} style={{ width: `${fcl < 0 ? 0 : fcl}%` }} />
          </div>
          <div className="flex items-center justify-between mt-2 gap-2">
            <span className="text-[11px] text-slate-400">
              {fcl < 0
                ? pDirty === 0
                  ? 'Đang tắt cảnh báo lõi bẩn'
                  : 'Máy tính khi xong một lượt lọc (từ 30 giây)'
                : `Lõi sạch ${status?.fcl_ma ?? 0} mA · bẩn ở ${pDirty} mA${
                    status?.pavg ? ` · lượt vừa rồi TB ${status.pavg} mA` : ''
                  }`}
            </span>
            <button
              onClick={handleFilterReset}
              disabled={!status}
              className="shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-cyan-300 bg-cyan-950/70 hover:bg-cyan-900 border border-cyan-800/60 disabled:opacity-40 transition-all"
            >
              Đã thay lõi
            </button>
          </div>
        </div>

        {/* Thay nuoc tu dong (van xa tuy chon) */}
        <button
          onClick={() => onNavigateTab(hasDrainValve ? 'schedule' : 'tech')}
          className="text-left p-4 rounded-2xl bg-slate-900/80 hover:bg-slate-900 border border-slate-800/80 hover:border-slate-700 transition-all"
        >
          <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
            <RefreshCw className={`w-4 h-4 text-orange-400 ${isDraining ? 'animate-spin' : ''}`} />
            <span>Thay nước tự động</span>
          </div>
          {!hasDrainValve ? (
            <div className="text-[11px] text-slate-400 mt-2 leading-relaxed">
              Máy chưa lắp van xả. Nếu đã lắp, bật mục &quot;Có lắp van xả&quot; trong tab Kỹ thuật →
            </div>
          ) : (
            <>
              <div className="text-sm font-bold text-slate-100 mt-1.5">
                {isDraining
                  ? `Đang xả · còn ${formatDuration(status?.dleft ?? 0)}`
                  : config?.d_mode === 1
                  ? `Theo TDS: xả khi trên ${config.tds_hi} ppm${
                      (status?.dtry ?? 0) > 0 ? ` · đã xả ${status?.dtry}/${tdsMaxTries(config)} lần` : ''
                    }`
                  : status?.dnext_t
                  ? `Lần tới ${formatLocalHm(status.dnext_t)} ngày ${new Date(status.dnext_t * 1000)
                      .getUTCDate()
                      .toString()
                      .padStart(2, '0')}/${(new Date(status.dnext_t * 1000).getUTCMonth() + 1).toString().padStart(2, '0')}`
                  : 'Chưa có giờ – chưa tự xả'}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                {config?.d_mode === 1
                  ? `Xả tiếp tới khi TDS ≤ ${config.tds_lo} ppm · mỗi lần ${formatDuration(drainSec)}`
                  : `Mỗi ${config?.d_days ?? 3} ngày · mỗi lần ${formatDuration(drainSec)}`}{' '}
                – chạm để đổi →
              </div>
            </>
          )}
        </button>
      </div>

      {/* Nhiet do + TDS tuc thoi */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800/80">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
            <Thermometer className="w-3.5 h-3.5 text-emerald-400" />
            <span>Nhiệt độ nước</span>
          </div>
          <div className="text-lg font-black font-mono text-slate-100">
            {status?.w !== null && status?.w !== undefined ? `${status.w.toFixed(1)} °C` : '—'}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {status && status.w === null
              ? 'Cảm biến lỗi'
              : isSensorRealtime(config)
              ? 'Cập nhật liên tục'
              : `Đo khi nước chảy, ${formatMinutes(config?.tds_int ?? 30)} / lần`}
          </div>
        </div>
        <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800/80">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
            <Activity className="w-3.5 h-3.5 text-purple-400" />
            <span>TDS tức thời</span>
          </div>
          <div className="text-lg font-black font-mono text-slate-100">{status ? `${status.tds_live} ppm` : '—'}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {pumpOn ? 'Nước đang chảy qua đầu dò' : 'Nước đứng – chỉ để tham khảo'}
          </div>
        </div>
      </div>
    </div>
  );
};
