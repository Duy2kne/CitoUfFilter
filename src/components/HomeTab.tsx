/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Droplet,
  Filter,
  Flame,
  Gauge,
  RefreshCw,
  HelpCircle,
  Play,
  Power,
  RotateCcw,
  Square,
  Thermometer,
  Zap,
} from 'lucide-react';
import {
  ERROR_DEFINITIONS,
  FILTER_MODES,
  formatCurrent,
  formatDuration,
  formatLocalHm,
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
  const [isMeasuringLoading, setIsMeasuringLoading] = useState(false);
  const [isDrainLoading, setIsDrainLoading] = useState(false);

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

  const isPowerOn = status ? status.pw === 1 : true;
  const isDraining = status ? status.st === 6 : false;
  // Bom dang chay 1 luot co tien do (loc lich / loc tay / thay nuoc)
  const isFiltering = status ? status.st === 2 || status.st === 3 || status.st === 6 : false;
  const isManual = status ? status.man === 1 : false;
  const isMeasuring = status ? status.st === 4 : false;
  const isFault = status ? status.st === 5 : false;

  const currentMode = config
    ? FILTER_MODES.find((m) => m.id === config.fmode)
    : FILTER_MODES[3];

  const activeErrors = status ? parseErrors(status.err, status.wrn) : [];
  const hasLockError = status ? isLockedFault(status.err) : false;
  const hasDrainValve = (config?.drain ?? 0) === 1 || (status?.d?.[0] ?? 0) === 1;

  // Circular gauge calculations: vong chay theo phan DA chay cua luot (giong man hinh may)
  const totalRunSecs = status?.run.tot || (config?.fmin ? config.fmin * 60 : 1800);
  const remainingSecs = Math.max(0, localRunLeft);
  const progressRatio = isFiltering && totalRunSecs > 0
    ? Math.min(1, Math.max(0, 1 - remainingSecs / totalRunSecs))
    : 0;

  // SVG parameters
  const size = 260;
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  // Use a 270-degree arc with bottom gap for gauge look
  const arcLength = circumference * 0.75;
  const strokeDashoffset = isFiltering
    ? arcLength * (1 - progressRatio)
    : arcLength;

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
    if (!status) return;
    if (status.pw === 1) {
      onRequestConfirm(
        'Tắt máy lọc nước?',
        'Máy sẽ dừng toàn bộ chu trình lọc tự động và ngắt bơm. Bạn có chắc chắn muốn tắt?',
        () => onSendCommand('POWER', { on: false }),
        true
      );
    } else {
      // Power on clears locks
      onSendCommand('POWER', { on: true });
    }
  };

  const handleToggleFilter = () => {
    if (!status) return;
    if (isManual) {
      onSendCommand('FILTER', { on: false });
    } else {
      onSendCommand('FILTER', { on: true });
    }
  };

  const handleMeasureTds = async () => {
    try {
      setIsMeasuringLoading(true);
      await onSendCommand('MEASURE');
    } finally {
      setIsMeasuringLoading(false);
    }
  };

  const handleClearFaults = () => {
    onSendCommand('CLEAR_FAULTS');
  };

  const handleToggleDrain = async () => {
    if (!status) return;
    if (isDraining) {
      onSendCommand('DRAIN', { on: false });
      return;
    }
    onRequestConfirm(
      'Thay nước ngay?',
      `Máy sẽ đóng van lọc, mở van xả và bơm nước ra ngoài trong ${formatDuration(config?.d_sec ?? 60)}. Tiếp tục?`,
      async () => {
        try {
          setIsDrainLoading(true);
          await onSendCommand('DRAIN', { on: true });
        } finally {
          setIsDrainLoading(false);
        }
      }
    );
  };

  const handleFilterReset = () => {
    onRequestConfirm(
      'Đã thay lõi lọc mới?',
      'Máy sẽ quên dòng bơm lúc lõi sạch cũ và học lại ở lượt lọc sau (độ sạch tạm hiện "chưa biết").',
      () => onSendCommand('FILTER_RESET')
    );
  };

  // Do sach loi loc: xanh >= 50 %, vang 20-50 %, do < 20 %
  const fcl = status?.fcl ?? -1;
  const fclColor = fcl < 0 ? 'bg-slate-700' : fcl >= 50 ? 'bg-emerald-500' : fcl >= 20 ? 'bg-amber-500' : 'bg-rose-500';

  const handleSyncTime = () => {
    const localEpochSeconds = Math.floor(Date.now() / 1000 - new Date().getTimezoneOffset() * 60);
    onSendCommand('TIME_SET', { t: localEpochSeconds });
  };

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
                    <div className="flex items-center gap-2">
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
                  {['E1', 'E2', 'E5', 'E6', 'E11', 'E12'].includes(err.code) && (
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
      <div className="relative rounded-3xl bg-gradient-to-b from-slate-900/90 to-slate-950/90 border border-slate-800/80 p-6 flex flex-col items-center justify-center shadow-2xl overflow-hidden">
        {/* Ambient Back Glow */}
        <div
          className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 rounded-full bg-gradient-to-b ${statusStyle.glow} blur-3xl pointer-events-none -z-0`}
        />

        <div className="relative z-10 w-full max-w-[280px] aspect-square flex items-center justify-center">
          <svg className="w-full h-full -rotate-[135deg]" viewBox={`0 0 ${size} ${size}`}>
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
            <defs>
              <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#06b6d4" />
                <stop offset="100%" stopColor="#3b82f6" />
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
              <span className="text-sm font-semibold text-cyan-400 uppercase tracking-wider">
                ppm
              </span>
            </div>

            {/* TDS Age / Measure Trigger */}
            <div className="mt-1 flex flex-col items-center">
              <span className="text-[11px] text-slate-400">
                {status ? formatTdsAge(status.tds_age) : 'Chưa có dữ liệu'}
              </span>

              {status && (status.tds === null || status.tds_age === null || status.tds_age > 1800) && !isFiltering && isPowerOn && !hasLockError && (
                <button
                  onClick={handleMeasureTds}
                  disabled={isMeasuringLoading || isMeasuring}
                  className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold text-cyan-300 bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-800/60 shadow-sm transition-all"
                >
                  <Gauge className="w-3 h-3" />
                  <span>{isMeasuringLoading ? 'Đang gửi…' : 'Đo TDS ngay'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Scale labels at arc endpoints */}
          <div className="absolute bottom-4 left-6 text-[10px] font-mono text-slate-500">
            0 ph
          </div>
          <div className="absolute bottom-4 right-6 text-[10px] font-mono text-slate-500">
            {isFiltering ? Math.max(1, Math.round(totalRunSecs / 60)) : config?.fmin || 30} ph
          </div>
        </div>
      </div>

      {/* 2 Primary Information Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        {/* Current Filter Mode */}
        <button
          onClick={() => onNavigateTab('schedule')}
          className="text-left p-4 rounded-2xl bg-slate-900/80 hover:bg-slate-900 border border-slate-800/80 hover:border-slate-700 transition-all group flex items-start justify-between"
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-950/70 border border-cyan-800/50 text-cyan-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-slate-400 font-medium">Chế độ lọc</div>
              <div className="text-sm font-bold text-slate-100 flex items-center gap-1.5 mt-0.5">
                <span>{currentMode?.name || 'Ban đêm'}</span>
                <span className="text-slate-500 text-xs font-normal">·</span>
                <span className="text-xs font-normal text-cyan-300">{currentMode?.hours}</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                {config ? `Lọc ${config.fmin} ph mỗi giờ` : 'Chạm để đổi lịch lọc →'}
              </div>
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
              {isDraining ? 'Thay nước còn lại' : isFiltering ? 'Thời gian còn lại' : 'Lần lọc tiếp theo'}
            </div>

            {isFiltering ? (
              <div>
                <div className="text-sm font-bold text-cyan-300 font-mono mt-0.5">
                  Còn {formatDuration(remainingSecs)}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Tổng thời gian lượt: {formatDuration(totalRunSecs)}
                </div>
              </div>
            ) : localNext > 0 ? (
              <div>
                <div className="text-sm font-bold text-slate-100 font-mono mt-0.5 flex items-center gap-1.5">
                  <span>Còn {formatDuration(localNext)}</span>
                  {status?.next_t && status.next_t > 0 ? (
                    <span className="text-xs font-normal text-emerald-400">
                      (lúc {new Date(status.next_t * 1000).getUTCHours().toString().padStart(2, '0')}:
                      {new Date(status.next_t * 1000).getUTCMinutes().toString().padStart(2, '0')})
                    </span>
                  ) : null}
                </div>
                <div className="text-[11px] text-emerald-400/80 mt-1">Máy đang ở chế độ chờ sẵn sàng</div>
              </div>
            ) : (
              <div>
                <div className="text-sm font-bold text-slate-400 mt-0.5">—</div>
                <div className="text-[11px] text-slate-400 mt-1">
                  {!isPowerOn
                    ? 'Máy đang tắt'
                    : config?.fmode === 0
                    ? 'Chế độ thủ công'
                    : hasLockError
                    ? 'Đang có lỗi khóa máy'
                    : 'Chưa có lịch'}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Loi loc + Thay nuoc */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        {/* Do sach loi loc (theo dong bom) */}
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800/80">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
              <Filter className="w-4 h-4 text-cyan-400" />
              <span>Độ sạch lõi lọc</span>
            </div>
            <span className="text-lg font-black font-mono text-slate-100">{fcl < 0 ? '—' : `${fcl}%`}</span>
          </div>
          <div className="mt-2 h-2.5 rounded-full bg-slate-800 overflow-hidden">
            <div className={`h-full rounded-full transition-all ${fclColor}`} style={{ width: `${fcl < 0 ? 0 : fcl}%` }} />
          </div>
          <div className="flex items-center justify-between mt-2 gap-2">
            <span className="text-[11px] text-slate-400">
              {fcl < 0
                ? (config?.p_dirty ?? 0) === 0
                  ? 'Đang tắt cảnh báo lõi bẩn (p_dirty = 0)'
                  : 'Máy học sau khi bơm chạy ổn định'
                : `Lõi sạch ${status?.fcl_ma ?? 0} mA · bẩn ở ${config?.p_dirty ?? 0} mA`}
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

        {/* Thay nuoc (van xa tuy chon) */}
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800/80">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
              <RefreshCw className={`w-4 h-4 text-orange-400 ${isDraining ? 'animate-spin' : ''}`} />
              <span>Thay nước (xả)</span>
            </div>
            {hasDrainValve && (
              <span className="text-[11px] text-slate-400">
                Mỗi {config?.d_days ?? 3} ngày · xả {formatDuration(config?.d_sec ?? 60)}
              </span>
            )}
          </div>
          {!hasDrainValve ? (
            <div className="text-[11px] text-slate-400 mt-2">
              Chưa lắp van xả. Bật mục &quot;Có lắp van xả&quot; trong tab Kỹ thuật để dùng thay nước tự động.
            </div>
          ) : (
            <div className="flex items-end justify-between mt-1.5 gap-2">
              <div>
                {isDraining ? (
                  <div className="text-sm font-bold font-mono text-orange-300">
                    Đang xả · còn {formatDuration(status?.dleft ?? 0)}
                  </div>
                ) : (
                  <div className="text-sm font-bold font-mono text-slate-100">
                    {status?.dnext_t ? `Lần tới ${formatLocalHm(status.dnext_t)}` : 'Chưa có giờ'}
                    {status?.dnext_t ? (
                      <span className="text-[11px] font-normal text-slate-400 ml-1.5">
                        {new Date(status.dnext_t * 1000).getUTCDate().toString().padStart(2, '0')}/
                        {(new Date(status.dnext_t * 1000).getUTCMonth() + 1).toString().padStart(2, '0')}
                      </span>
                    ) : null}
                  </div>
                )}
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {status ? `Van xả ${status.d[1] === 1 ? 'mở' : 'đóng'} · ${formatCurrent(status.d[3])}` : '—'}
                </div>
              </div>
              <button
                onClick={handleToggleDrain}
                disabled={!isPowerOn || hasLockError || isDrainLoading}
                className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all disabled:opacity-40 ${
                  isDraining
                    ? 'bg-rose-600 hover:bg-rose-500 text-white border-rose-400/40'
                    : 'bg-orange-950/70 hover:bg-orange-900 text-orange-300 border-orange-800/60'
                }`}
              >
                {isDraining ? 'Dừng xả' : 'Thay nước ngay'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Large Action Buttons */}
      <div className="grid grid-cols-2 gap-3.5">
        {/* Power On/Off */}
        <button
          onClick={handleTogglePower}
          className={`flex items-center justify-center gap-2 py-3.5 px-4 rounded-2xl font-semibold text-sm border shadow-lg transition-all active:scale-[0.98] ${
            isPowerOn
              ? 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-700/80 shadow-slate-950/40'
              : 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400/40 shadow-emerald-950/50'
          }`}
        >
          <Power className={`w-4 h-4 ${isPowerOn ? 'text-slate-400' : 'text-white'}`} />
          <span>{isPowerOn ? 'Tắt máy' : 'Bật máy'}</span>
        </button>

        {/* Manual Filter Trigger */}
        <button
          onClick={handleToggleFilter}
          disabled={!isPowerOn || hasLockError}
          className={`flex items-center justify-center gap-2 py-3.5 px-4 rounded-2xl font-semibold text-sm border shadow-lg transition-all active:scale-[0.98] ${
            !isPowerOn || hasLockError
              ? 'bg-slate-900/50 text-slate-500 border-slate-800 cursor-not-allowed'
              : isManual
              ? 'bg-rose-600 hover:bg-rose-500 text-white border-rose-400/40 shadow-rose-950/50'
              : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white border-cyan-400/30 shadow-cyan-950/60'
          }`}
        >
          {isManual ? (
            <>
              <Square className="w-4 h-4 text-white fill-white" />
              <span>Dừng lọc</span>
            </>
          ) : (
            <>
              <Play className="w-4 h-4 text-white fill-white" />
              <span>Lọc ngay ({config?.man_min || 30} ph)</span>
            </>
          )}
        </button>
      </div>

      {/* Mini Diagnostic Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Pump */}
        <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800/80">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-cyan-400" />
              <span>Bơm lọc</span>
            </span>
            <span
              className={`w-2 h-2 rounded-full ${
                status?.p[0] === 1 ? 'bg-cyan-400 shadow-[0_0_6px_#22d3ee]' : 'bg-slate-700'
              }`}
            />
          </div>
          <div className="text-sm font-bold text-slate-100">
            {status?.p[0] === 1 ? 'Đang chạy' : 'Đang nghỉ'}
          </div>
          <div className="text-[11px] text-slate-400 font-mono mt-0.5">
            {status ? formatCurrent(status.p[2]) : '—'}
          </div>
        </div>

        {/* Valve (Only show if valve is installed: v[0] === 1) */}
        {status?.v[0] === 1 && (
          <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800/80">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span className="flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-blue-400" />
                <span>Van lọc</span>
              </span>
              <span
                className={`w-2 h-2 rounded-full ${
                  status?.v[1] === 1 ? 'bg-blue-400 shadow-[0_0_6px_#60a5fa]' : 'bg-slate-700'
                }`}
              />
            </div>
            <div className="text-sm font-bold text-slate-100">
              {status?.v[1] === 1 ? 'Đang mở' : 'Đang đóng'}
            </div>
            <div className="text-[11px] text-slate-400 font-mono mt-0.5">
              {status ? formatCurrent(status.v[3]) : '—'}
            </div>
          </div>
        )}

        {/* Water Temperature */}
        <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800/80">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span className="flex items-center gap-1.5">
              <Thermometer className="w-3.5 h-3.5 text-emerald-400" />
              <span>Nhiệt độ nước</span>
            </span>
          </div>
          <div className="text-sm font-bold text-slate-100">
            {status?.w !== null && status?.w !== undefined ? `${status.w.toFixed(1)} °C` : '—'}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {status?.w === null ? 'Cảm biến lỗi' : 'Tự bù nhiệt TDS'}
          </div>
        </div>

        {/* Power & Energy */}
        <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800/80">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span className="flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-amber-400" />
              <span>Công suất</span>
            </span>
          </div>
          <div className="text-sm font-bold text-slate-100">
            {status ? `${status.wt.toFixed(0)} W` : '—'}
          </div>
          <div className="text-[11px] text-slate-400 font-mono mt-0.5">
            30 ngày:{' '}
            {status
              ? status.kwh < 1
                ? `${Math.round(status.kwh * 1000)} Wh`
                : `${status.kwh.toFixed(2)} kWh`
              : '—'}
          </div>
        </div>
      </div>
    </div>
  );
};
