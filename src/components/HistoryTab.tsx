/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  Droplet,
  Info,
  Play,
  Power,
  RefreshCw,
  RotateCcw,
  Sliders,
  Trash2,
  Wifi,
} from 'lucide-react';
import {
  calculateFilterMetrics,
  formatHistoryEvent,
  FormattedHistoryEvent,
} from '../services/history';
import { HistoryEventTuple } from '../types/system';

interface HistoryTabProps {
  history: HistoryEventTuple[];
  isConnected?: boolean;
  onSendCommand: (action: string, params?: Record<string, unknown>) => Promise<unknown>;
  onRequestConfirm: (title: string, message: string, onConfirm: () => void | Promise<unknown>, isDangerous?: boolean) => void;
}

export const HistoryTab: React.FC<HistoryTabProps> = ({
  history,
  isConnected = false,
  onSendCommand,
  onRequestConfirm,
}) => {
  const [filterCategory, setFilterCategory] = useState<'all' | 'run' | 'error' | 'config'>('all');
  const [isLoading, setIsLoading] = useState(false);

  // Compute metrics from history
  const metrics = useMemo(() => calculateFilterMetrics(history), [history]);

  // Format and group events by date
  const formattedEvents = useMemo(() => {
    return history.map(formatHistoryEvent);
  }, [history]);

  // Filter events
  const filteredEvents = useMemo(() => {
    if (filterCategory === 'all') return formattedEvents;
    return formattedEvents.filter((ev) => ev.category === filterCategory);
  }, [formattedEvents, filterCategory]);

  // Group filtered events by dateHeader
  const groupedEvents = useMemo(() => {
    const groups: { dateHeader: string; events: FormattedHistoryEvent[] }[] = [];
    for (const ev of filteredEvents) {
      let grp = groups.find((g) => g.dateHeader === ev.dateHeader);
      if (!grp) {
        grp = { dateHeader: ev.dateHeader, events: [] };
        groups.push(grp);
      }
      grp.events.push(ev);
    }
    return groups;
  }, [filteredEvents]);

  const handleReload = async () => {
    try {
      setIsLoading(true);
      await onSendCommand('GET_HISTORY');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = () => {
    onRequestConfirm(
      'Xóa toàn bộ nhật ký sự kiện?',
      'Hành động này sẽ xóa sạch 100 sự kiện được lưu trong bộ nhớ máy lọc và không thể khôi phục.',
      () => onSendCommand('CLEAR_HISTORY'),
      true
    );
  };

  const getEventIcon = (iconName: string) => {
    switch (iconName) {
      case 'droplet':
        return <Droplet className="w-4 h-4 text-cyan-400" />;
      case 'alert-triangle':
        return <AlertTriangle className="w-4 h-4 text-rose-400" />;
      case 'check-circle':
        return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
      case 'power':
        return <Power className="w-4 h-4 text-emerald-400" />;
      case 'circle-off':
        return <Power className="w-4 h-4 text-slate-500" />;
      case 'sliders':
        return <Sliders className="w-4 h-4 text-cyan-400" />;
      case 'play':
        return <Play className="w-4 h-4 text-blue-400" />;
      case 'clock':
        return <Clock className="w-4 h-4 text-indigo-400" />;
      case 'wifi':
        return <Wifi className="w-4 h-4 text-sky-400" />;
      case 'rotate-ccw':
        return <RotateCcw className="w-4 h-4 text-orange-400" />;
      case 'download':
        return <Download className="w-4 h-4 text-emerald-400" />;
      case 'activity':
        return <Activity className="w-4 h-4 text-teal-400" />;
      default:
        return <Info className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <div className="space-y-5 pb-12 animate-in fade-in duration-200">
      {/* Top Filter Duration Metrics Banner */}
      <div className="grid grid-cols-2 gap-3.5">
        <div className="p-4 rounded-3xl bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 shadow-xl">
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
            <Clock className="w-4 h-4 text-cyan-400" />
            <span>Đã lọc hôm nay</span>
          </div>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-3xl font-black font-mono text-cyan-400 tracking-tight">
              {metrics.minutesToday}
            </span>
            <span className="text-xs font-semibold text-slate-400">phút</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            ≈ {(metrics.minutesToday / 60).toFixed(1)} giờ bơm hoạt động
          </div>
        </div>

        <div className="p-4 rounded-3xl bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 shadow-xl">
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
            <Calendar className="w-4 h-4 text-blue-400" />
            <span>Đã lọc 7 ngày qua</span>
          </div>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-3xl font-black font-mono text-blue-400 tracking-tight">
              {metrics.minutes7Days}
            </span>
            <span className="text-xs font-semibold text-slate-400">phút</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            ≈ {(metrics.minutes7Days / 60).toFixed(1)} giờ tổng cộng
          </div>
        </div>
      </div>

      {/* Action Controls & Category Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Category Filter Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-900 rounded-2xl border border-slate-800 overflow-x-auto">
          <button
            onClick={() => setFilterCategory('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
              filterCategory === 'all'
                ? 'bg-cyan-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Tất cả ({history.length})
          </button>
          <button
            onClick={() => setFilterCategory('run')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
              filterCategory === 'run'
                ? 'bg-cyan-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Lượt lọc
          </button>
          <button
            onClick={() => setFilterCategory('error')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
              filterCategory === 'error'
                ? 'bg-cyan-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Lỗi
          </button>
          <button
            onClick={() => setFilterCategory('config')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
              filterCategory === 'config'
                ? 'bg-cyan-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Cài đặt
          </button>
        </div>

        {/* Reload & Clear Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleReload}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-slate-100 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl transition-all"
            title="Tải lại nhật ký từ máy"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Tải lại</span>
          </button>
          <button
            onClick={handleClear}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-400 hover:text-rose-300 bg-rose-950/30 hover:bg-rose-950/60 border border-rose-900/40 rounded-xl transition-all"
            title="Xóa bộ nhớ nhật ký trên máy"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Xóa nhật ký</span>
          </button>
        </div>
      </div>

      {/* History List Grouped by Day */}
      {groupedEvents.length === 0 ? (
        <div className="p-12 text-center rounded-3xl bg-slate-900/60 border border-slate-800/80 space-y-3">
          <Clock className="w-8 h-8 text-slate-600 mx-auto" />
          <div className="text-sm font-semibold text-slate-300">Chưa có sự kiện nào</div>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {isConnected
              ? 'Các sự kiện như bật/tắt máy, lượt lọc hoàn thành hoặc cảnh báo lỗi sẽ tự động được ghi lại tại đây.'
              : 'Hãy kết nối Bluetooth với máy lọc hoặc vào Chế độ Thử nghiệm (Demo) để đồng bộ nhật ký từ bộ nhớ máy.'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groupedEvents.map((group) => (
            <div key={group.dateHeader} className="space-y-2.5">
              {/* Clean Date Header */}
              <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider px-1">
                <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                <span>{group.dateHeader}</span>
                <div className="flex-1 h-px bg-slate-800/80 ml-2" />
              </div>

              {/* Day Event Items */}
              <div className="space-y-2">
                {group.events.map((ev, idx) => (
                  <div
                    key={`${ev.raw[0]}_${ev.raw[1]}_${ev.raw[2]}_${ev.raw[3]}_${idx}`}
                    className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800/80 hover:border-slate-700/80 transition-all flex items-start justify-between gap-3"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                        {getEventIcon(ev.icon)}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-100 leading-snug">
                          {ev.title}
                        </div>
                        {ev.detail && (
                          <div className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                            {ev.detail}
                          </div>
                        )}
                        <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-1">
                          <span className="font-mono text-cyan-400/90">{ev.timeText}</span>
                          <span aria-hidden="true">·</span>
                          <span className="text-slate-400">{ev.sourceText}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
