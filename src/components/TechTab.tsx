/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';

// O nhap so: chi gui khi roi o / bam Enter (khong gui tung phim -> may khong nhan gia tri do dang)
const NumField: React.FC<{
  value: number;
  step?: number;
  className?: string;
  onCommit: (v: number) => void;
}> = ({ value, step = 1, className, onCommit }) => {
  const [text, setText] = useState<string>(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const v = Number(text);
    if (text.trim() === '' || !Number.isFinite(v)) { setText(String(value)); return; }
    if (v !== value) onCommit(v);
  };
  return (
    <input
      type="number"
      step={step}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      className={className}
    />
  );
};
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Cpu,
  Flame,
  Gauge,
  Lock,
  RefreshCw,
  RotateCcw,
  Sliders,
  Sparkles,
  Wifi,
  Zap,
} from 'lucide-react';
import {
  formatCurrent,
  formatDuration,
  formatMinutes,
  PUMP_TYPES,
  UfConfig,
  UfStatus,
} from '../types/system';

interface TechTabProps {
  status: UfStatus | null;
  config: UfConfig | null;
  wifiList: [string, number, number][];
  isDemo: boolean;
  onSendCommand: (action: string, params?: Record<string, unknown>) => Promise<unknown>;
  onRequestConfirm: (title: string, message: string, onConfirm: () => void, isDangerous?: boolean) => void;
  onInjectDemoFault: (code: number) => void;
  onClearDemoFaults: () => void;
}

export const TechTab: React.FC<TechTabProps> = ({
  status,
  config,
  wifiList,
  isDemo,
  onSendCommand,
  onRequestConfirm,
  onInjectDemoFault,
  onClearDemoFaults,
}) => {
  // Collapsible section open states
  const [openSection, setOpenSection] = useState<string | null>('features'); // Mo san: loai bom, van loc, van xa

  // Calibration Form States
  const [tdsCalPpm, setTdsCalPpm] = useState<number>(140);
  const [acsChannel, setAcsChannel] = useState<number>(0);
  const [acsClampMa, setAcsClampMa] = useState<number>(380);

  // WiFi Form States
  const [selectedSsid, setSelectedSsid] = useState<string>('');
  const [wifiPass, setWifiPass] = useState<string>('');
  const [isScanningWifi, setIsScanningWifi] = useState(false);

  // PIN Form State
  const [newPin, setNewPin] = useState<string>('');

  const toggleSection = (id: string) => {
    setOpenSection(openSection === id ? null : id);
  };

  const handleUpdateConfig = (key: string, val: unknown) => {
    onSendCommand('SET', { [key]: val });
  };

  // Auto baseline currents calculator
  const handleAutoCurrentBaseline = () => {
    if (!status || status.p[2] < 50) {
      alert('Vui lòng bật bơm trước (phải có dòng hoạt động >= 50 mA) để đo chuẩn.');
      return;
    }
    const currentPumpMa = status.p[2];
    const suggestedDirty = Math.round(currentPumpMa * 1.3);
    const suggestedBlock = Math.round(currentPumpMa * 2.0);

    onRequestConfirm(
      'Áp dụng ngưỡng bảo vệ dòng gợi ý?',
      `Dòng đo hiện tại của bơm: ${formatCurrent(currentPumpMa)}.\n\n• Cảnh báo lõi bẩn: ${suggestedDirty} mA (+30%)\n• Ngắt khẩn cấp quá dòng: ${suggestedBlock} mA (+100%)\n\nBạn có muốn lưu các giá trị này không?`,
      () => {
        onSendCommand('SET', {
          p_dirty: suggestedDirty,
          p_block: suggestedBlock,
        });
      }
    );
  };

  // Loai bom: may doi sang bo nguong cua loai kia + hoc lai dong loi sach
  const handleSetPumpType = (t: number) => {
    if (!config || t === config.ptype) return;
    onRequestConfirm(
      t === 1 ? 'Đổi sang bơm lớn?' : 'Đổi sang bơm nhỏ?',
      'Máy sẽ dùng bộ ngưỡng dòng của loại bơm này và học lại dòng lõi sạch ở lượt lọc sau. Chỉ đổi khi máy thật sự lắp loại bơm đó.',
      () => onSendCommand('SET', { ptype: t })
    );
  };

  // Dua 3 nguong cua loai bom dang chon ve mac dinh nha san xuat
  const handlePumpDefaults = () => {
    const p = PUMP_TYPES[config?.ptype === 1 ? 1 : 0];
    onRequestConfirm(
      `Dùng ngưỡng mặc định của ${p.name.toLowerCase()}?`,
      `Tối thiểu ${p.p_min} mA · lõi bẩn ${p.p_dirty} mA · ngắt ${p.p_block} mA.`,
      () => onSendCommand('SET', { p_min: p.p_min, p_dirty: p.p_dirty, p_block: p.p_block })
    );
  };

  // Zero-current calibration
  const handleAcsZero = () => {
    onSendCommand('ACS_ZERO');
  };

  // Clamp meter calibration
  const handleAcsCalibrate = () => {
    onSendCommand('ACS_CAL', { ch: acsChannel, ma: acsClampMa });
  };

  // Dat diem 0 TDS: dau do kho ma van doc ra so -> lay so do lam moc 0 ppm
  const handleTdsZero = () => {
    onRequestConfirm(
      'Đặt điểm 0 cho cảm biến TDS?',
      `Máy sẽ coi số đang đọc (${status ? status.tds_live : '—'} ppm) là 0 ppm. Chỉ làm khi đầu dò đang cắm vào máy, đã nhấc khỏi nước và lau khô.`,
      () => onSendCommand('TDS_ZERO')
    );
  };

  const handleTdsZeroClear = () => {
    onRequestConfirm('Bỏ điểm 0 TDS?', 'Máy sẽ đọc TDS như lúc chưa đặt điểm 0.', () => onSendCommand('SET', { tds_z: 0 }));
  };

  // TDS Calibration
  const handleTdsCalibrate = () => {
    onSendCommand('TDS_CAL', { ppm: tdsCalPpm });
  };

  // WiFi Scan
  const handleScanWifi = async () => {
    try {
      setIsScanningWifi(true);
      await onSendCommand('WIFI_SCAN');
    } finally {
      setIsScanningWifi(false);
    }
  };

  const handleSaveWifi = () => {
    if (!selectedSsid) return;
    onSendCommand('WIFI_SET', { ssid: selectedSsid, pass: wifiPass });
  };

  const handleClearWifi = () => {
    onRequestConfirm(
      'Xóa WiFi nhà?',
      'Máy lọc sẽ mất kết nối Internet và không thể tự đồng bộ giờ hoặc nạp firmware qua IP nhà.',
      () => onSendCommand('WIFI_CLEAR'),
      true
    );
  };

  const handleSetPin = () => {
    if (newPin.length < 4 || newPin.length > 8) {
      alert('Mã PIN mới phải từ 4 đến 8 ký tự.');
      return;
    }
    onSendCommand('SET_PIN', { pin: newPin });
    setNewPin('');
  };

  const handleFactoryReset = () => {
    onRequestConfirm(
      'Khôi phục cài đặt mặc định?',
      'Toàn bộ lịch lọc và ngưỡng cảnh báo sẽ trở về mặc định của nhà sản xuất. Cấu hình WiFi và hiệu chuẩn cảm biến được giữ nguyên.',
      () => onSendCommand('DEFAULTS'),
      true
    );
  };

  const handleReboot = () => {
    onRequestConfirm(
      'Khởi động lại máy lọc?',
      'Máy sẽ khởi động lại phần mềm sau khoảng 0.8 giây. Kết nối Bluetooth sẽ tự động kết nối lại.',
      () => onSendCommand('REBOOT')
    );
  };

  // Hieu chuan TDS: may chi nhan khi bom LOC da chay lien tuc >= tds_run giay (dang xa thi khong tinh)
  const tdsRun = config?.tds_run ?? 10;
  const tdsInt = config?.tds_int ?? 30;
  const isPumpRunningForTds = status?.p[0] === 1 && status?.st !== 6;
  const elapsedRunSeconds = status ? status.rdur : 0;
  const isTdsReady = isPumpRunningForTds && elapsedRunSeconds >= tdsRun;

  return (
    <div className="space-y-4 pb-12 animate-in fade-in duration-200">
      {/* Notice header */}
      <div className="p-4 rounded-3xl bg-slate-900/90 border border-slate-800 flex items-start gap-3">
        <Sliders className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
        <div>
          <h2 className="text-sm font-bold text-slate-100">Cài đặt Kỹ thuật & Hiệu chuẩn</h2>
          <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
            Dành cho thợ lắp đặt hoặc người am hiểu thiết bị. Vui lòng chỉ điều chỉnh khi nắm rõ thông số để đảm bảo an toàn cho máy bơm.
          </p>
        </div>
      </div>

      {/* Demo Fault Injector (Only active in Demo mode) */}
      {isDemo && (
        <div className="p-4 rounded-3xl bg-indigo-950/40 border border-indigo-500/40 shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <span className="text-xs font-bold text-indigo-200 uppercase tracking-wider">
                Thử nghiệm lỗi (Chế độ Demo)
              </span>
            </div>
            <button
              onClick={onClearDemoFaults}
              className="text-xs text-indigo-300 hover:text-white font-semibold underline underline-offset-2"
            >
              Xóa sạch lỗi giả lập
            </button>
          </div>
          <p className="text-[11px] text-indigo-300/80 leading-normal">
            Bấm vào các nút dưới đây để tạo lỗi giả lập và kiểm tra phản ứng của giao diện và còi báo:
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => onInjectDemoFault(1)}
              className="px-2.5 py-1 text-xs font-mono font-medium rounded-lg bg-blue-950 border border-blue-700/60 text-blue-300 hover:bg-blue-900"
            >
              + E1 (Bơm mất dòng)
            </button>
            <button
              onClick={() => onInjectDemoFault(2)}
              className="px-2.5 py-1 text-xs font-mono font-medium rounded-lg bg-rose-950 border border-rose-700/60 text-rose-300 hover:bg-rose-900"
            >
              + E2 (Bơm quá dòng - Khóa)
            </button>
            <button
              onClick={() => onInjectDemoFault(3)}
              className="px-2.5 py-1 text-xs font-mono font-medium rounded-lg bg-amber-950 border border-amber-700/60 text-amber-300 hover:bg-amber-900"
            >
              + E3 (Lõi lọc bẩn)
            </button>
            <button
              onClick={() => onInjectDemoFault(5)}
              className="px-2.5 py-1 text-xs font-mono font-medium rounded-lg bg-blue-950 border border-blue-700/60 text-blue-300 hover:bg-blue-900"
            >
              + E5 (Van không mở)
            </button>
            <button
              onClick={() => onInjectDemoFault(11)}
              className="px-2.5 py-1 text-xs font-mono font-medium rounded-lg bg-blue-950 border border-blue-700/60 text-blue-300 hover:bg-blue-900"
            >
              + E11 (Van xả không mở)
            </button>
            <button
              onClick={() => onInjectDemoFault(12)}
              className="px-2.5 py-1 text-xs font-mono font-medium rounded-lg bg-rose-950 border border-rose-700/60 text-rose-300 hover:bg-rose-900"
            >
              + E12 (Van xả quá dòng - Khóa)
            </button>
            <button
              onClick={() => onInjectDemoFault(10)}
              className="px-2.5 py-1 text-xs font-mono font-medium rounded-lg bg-amber-950 border border-amber-700/60 text-amber-300 hover:bg-amber-900"
            >
              + E10 (TDS vượt ngưỡng)
            </button>
          </div>
        </div>
      )}

      {/* Accordion 1: Thiết bị & Tính năng */}
      <div className="rounded-3xl bg-slate-900/80 border border-slate-800 overflow-hidden">
        <button
          onClick={() => toggleSection('features')}
          className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-800/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Flame className="w-5 h-5 text-cyan-400" />
            <div>
              <div className="text-sm font-bold text-slate-100">1. Cấu hình Thiết bị & Còi báo</div>
              <div className="text-xs text-slate-400">Loại bơm, van lọc, van xả, đo TDS, còi bíp</div>
            </div>
          </div>
          {openSection === 'features' ? <ChevronDown className="w-5 h-5 text-slate-400" /> : <ChevronRight className="w-5 h-5 text-slate-400" />}
        </button>

        {openSection === 'features' && (
          <div className="p-4 border-t border-slate-800 space-y-4 text-xs animate-in fade-in">
            {/* Loai bom: moi loai 1 bo nguong rieng tren may */}
            <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="font-semibold text-slate-200">Loại bơm (động cơ) đang lắp</div>
              <div className="grid grid-cols-2 gap-2">
                {PUMP_TYPES.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleSetPumpType(p.id)}
                    disabled={!config}
                    className={`p-3 rounded-xl border text-left transition-all disabled:opacity-40 ${
                      (config?.ptype ?? 0) === p.id
                        ? 'bg-cyan-950/60 border-cyan-500 text-slate-100'
                        : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    <div className="font-bold">{p.name}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      mặc định {p.p_min} / {p.p_dirty} / {p.p_block} mA
                    </div>
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Máy nhớ riêng 3 ngưỡng dòng (tối thiểu / lõi bẩn / ngắt) cho từng loại bơm. Đổi loại thì máy đổi sang bộ ngưỡng
                kia và học lại dòng lõi sạch. Đang dùng: {config ? `${config.p_min} / ${config.p_dirty} / ${config.p_block} mA` : '—'}
                {' '}– chỉnh từng số ở mục 2.
              </p>
              <button
                onClick={handlePumpDefaults}
                disabled={!config}
                className="w-full py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-semibold disabled:opacity-40 transition-all"
              >
                Dùng ngưỡng mặc định của loại bơm đang chọn
              </button>
            </div>

            {/* Có van lọc */}
            <div className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-slate-950 border border-slate-800">
              <div>
                <div className="font-semibold text-slate-200">Có lắp van lọc điện từ</div>
                <div className="text-slate-400 mt-0.5 text-[11px]">
                  Tắt nếu hồ chỉ dùng bơm trực tiếp. Bật: mở van trước rồi mới bật bơm.
                </div>
              </div>
              <input
                type="checkbox"
                checked={config?.valve === 1}
                onChange={(e) => handleUpdateConfig('valve', e.target.checked ? 1 : 0)}
                className="w-5 h-5 shrink-0 accent-cyan-500 rounded cursor-pointer"
              />
            </div>

            {/* Có van xả (thay nước) */}
            <div className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-slate-950 border border-slate-800">
              <div>
                <div className="font-semibold text-slate-200">Có lắp van xả – thay nước</div>
                <div className="text-slate-400 mt-0.5 text-[11px]">
                  Tắt: máy không xả và không báo lỗi van xả. Cách xả (hẹn giờ / theo TDS) chọn ở tab Lịch lọc.
                </div>
              </div>
              <input
                type="checkbox"
                checked={config?.drain === 1}
                onChange={(e) => handleUpdateConfig('drain', e.target.checked ? 1 : 0)}
                className="w-5 h-5 shrink-0 accent-orange-500 rounded cursor-pointer"
              />
            </div>

            {/* Cach do TDS + nhiet do */}
            <div className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-slate-950 border border-slate-800">
              <div>
                <div className="font-semibold text-slate-200">Đo TDS + nhiệt độ liên tục</div>
                <div className="text-slate-400 mt-0.5 text-[11px]">
                  Tắt (khuyên dùng): {formatMinutes(tdsInt)} đo 1 lần lúc nước đang chảy rồi giữ số. Bật: cập nhật từng giây, kể cả khi
                  nước đứng nên kém chính xác hơn.
                </div>
              </div>
              <input
                type="checkbox"
                checked={config?.sens_rt === 1}
                onChange={(e) => handleUpdateConfig('sens_rt', e.target.checked ? 1 : 0)}
                className="w-5 h-5 shrink-0 accent-cyan-500 rounded cursor-pointer"
              />
            </div>

            {/* Tự đo TDS khi máy nghỉ */}
            <div
              className={`flex items-center justify-between gap-3 p-3 rounded-2xl bg-slate-950 border border-slate-800 ${
                config?.sens_rt === 1 ? 'opacity-50' : ''
              }`}
            >
              <div>
                <div className="font-semibold text-slate-200">Tự chạy bơm để đo khi máy nghỉ</div>
                <div className="text-slate-400 mt-0.5 text-[11px]">
                  Tới hạn đo mà máy đang nghỉ thì tự chạy bơm {tdsRun} giây để đo rồi tắt.
                </div>
              </div>
              <input
                type="checkbox"
                checked={config?.tds_auto === 1}
                onChange={(e) => handleUpdateConfig('tds_auto', e.target.checked ? 1 : 0)}
                className="w-5 h-5 shrink-0 accent-cyan-500 rounded cursor-pointer"
              />
            </div>

            {/* Chu ky do + thoi gian chay bom de do (Firmware 1.3.0) */}
            <div
              className={`p-3 rounded-2xl bg-slate-950 border border-slate-800 space-y-2 ${
                config?.sens_rt === 1 ? 'opacity-50' : ''
              }`}
            >
              <div>
                <div className="font-semibold text-slate-200">Thời gian đo TDS + nhiệt độ</div>
                <div className="text-slate-400 mt-0.5 text-[11px]">
                  Mặc định 30 phút đo 1 lần, nước chảy 10 giây rồi lấy số. Muốn đo thưa và kỹ hơn thì đặt ví dụ 60 phút,
                  20 giây. Cần Firmware 1.3.0 trở lên.
                </div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-300">Đo 1 lần mỗi (5–240)</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <NumField
                    value={tdsInt}
                    step={5}
                    onCommit={(v) => handleUpdateConfig('tds_int', Math.min(240, Math.max(5, Math.round(v))))}
                    className="w-20 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-right font-mono text-cyan-300"
                  />
                  <span className="text-slate-400 w-8">phút</span>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-300">Chạy bơm để đo (5–60)</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <NumField
                    value={tdsRun}
                    step={5}
                    onCommit={(v) => handleUpdateConfig('tds_run', Math.min(60, Math.max(5, Math.round(v))))}
                    className="w-20 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-right font-mono text-cyan-300"
                  />
                  <span className="text-slate-400 w-8">giây</span>
                </div>
              </div>
            </div>

            {/* Ngưỡng cảnh báo TDS */}
            <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex justify-between">
                <div>
                  <div className="font-semibold text-slate-200">Ngưỡng cảnh báo TDS cao</div>
                  <div className="text-slate-400 text-[11px]">Khi TDS vượt mức này máy sẽ báo E10 (0 = tắt cảnh báo)</div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <NumField
                    value={config?.tds_alarm ?? 0}
                    step={25}
                    onCommit={(v) => handleUpdateConfig('tds_alarm', Math.round(v))}
                    className="w-20 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-right font-mono text-cyan-300"
                  />
                  <span className="text-slate-400">ppm</span>
                </div>
              </div>
            </div>

            {/* Còi & Bíp */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-slate-950 border border-slate-800">
                <span className="text-slate-200 font-medium">Bíp khi bấm phím</span>
                <input
                  type="checkbox"
                  checked={config?.bz_key === 1}
                  onChange={(e) => handleUpdateConfig('bz_key', e.target.checked ? 1 : 0)}
                  className="w-4 h-4 shrink-0 accent-cyan-500 cursor-pointer"
                />
              </div>
              <div className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-slate-950 border border-slate-800">
                <span className="text-slate-200 font-medium">Còi hú khi có lỗi</span>
                <input
                  type="checkbox"
                  checked={config?.bz_alarm === 1}
                  onChange={(e) => handleUpdateConfig('bz_alarm', e.target.checked ? 1 : 0)}
                  className="w-4 h-4 shrink-0 accent-cyan-500 cursor-pointer"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Accordion 2: Bảo vệ dòng điện (Bơm & Van) */}
      <div className="rounded-3xl bg-slate-900/80 border border-slate-800 overflow-hidden">
        <button
          onClick={() => toggleSection('current')}
          className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-800/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Zap className="w-5 h-5 text-amber-400" />
            <div>
              <div className="text-sm font-bold text-slate-100">2. Bảo vệ dòng điện Bơm, Van lọc & Van xả</div>
              <div className="text-xs text-slate-400">Ngắt quá dòng, cảnh báo lõi bẩn, kẹt rotor</div>
            </div>
          </div>
          {openSection === 'current' ? <ChevronDown className="w-5 h-5 text-slate-400" /> : <ChevronRight className="w-5 h-5 text-slate-400" />}
        </button>

        {openSection === 'current' && (
          <div className="p-4 border-t border-slate-800 space-y-4 text-xs animate-in fade-in">
            {/* Live readout banner */}
            <div className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-slate-950 border border-slate-800">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-cyan-400" />
                <span className="text-slate-300">Dòng thực tế lúc này:</span>
              </div>
              <div className="flex items-center gap-4 font-mono font-bold">
                <span className="text-cyan-400">Bơm: {status ? formatCurrent(status.p[2]) : '—'}</span>
                {config?.valve === 1 && (
                  <span className="text-blue-400">Van: {status ? formatCurrent(status.v[3]) : '—'}</span>
                )}
                {config?.drain === 1 && (
                  <span className="text-orange-400">Xả: {status ? formatCurrent(status.d[3]) : '—'}</span>
                )}
              </div>
            </div>

            {/* Auto Suggestion Button */}
            <button
              onClick={handleAutoCurrentBaseline}
              className="w-full py-2.5 px-3 rounded-xl bg-cyan-950/70 hover:bg-cyan-900 border border-cyan-800/60 text-cyan-300 font-semibold transition-all flex items-center justify-center gap-2"
            >
              <Zap className="w-4 h-4" />
              <span>Lấy dòng hiện tại làm chuẩn (gợi ý tự động)</span>
            </button>

            {/* Threshold inputs: go xong (roi o / Enter) moi gui, khong gui tung phim */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-semibold text-slate-200">Dòng tối thiểu bơm</span>
                  <p className="text-[11px] text-slate-500">&lt; mức này 2s coi như bơm không chạy (E1)</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <NumField
                    value={config?.p_min ?? 40}
                    step={10}
                    onCommit={(v) => handleUpdateConfig('p_min', v)}
                    className="w-20 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-right font-mono text-slate-100"
                  />
                  <span className="text-slate-400">mA</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-semibold text-slate-200">Cảnh báo lõi lọc bẩn</span>
                  <p className="text-[11px] text-slate-500">Dòng trung bình cả lượt lọc &gt; mức này thì báo E3; cũng là mốc 0 % độ sạch lõi (0 = tắt)</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <NumField
                    value={config?.p_dirty ?? 0}
                    step={10}
                    onCommit={(v) => handleUpdateConfig('p_dirty', v)}
                    className="w-20 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-right font-mono text-slate-100"
                  />
                  <span className="text-slate-400">mA</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-semibold text-rose-300">Khóa dừng khẩn cấp quá dòng</span>
                  <p className="text-[11px] text-slate-500">&gt; mức này 0.3s ngắt bơm khóa máy (E2)</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <NumField
                    value={config?.p_block ?? 1200}
                    step={50}
                    onCommit={(v) => handleUpdateConfig('p_block', v)}
                    className="w-20 bg-slate-950 border border-rose-800 rounded-lg px-2 py-1 text-right font-mono text-rose-300"
                  />
                  <span className="text-slate-400">mA</span>
                </div>
              </div>
              {config?.valve === 1 && (
                <>
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-semibold text-slate-200">Van lọc: dòng tối thiểu</span>
                  <p className="text-[11px] text-slate-500">&lt; mức này 2s coi như van không mở (E5)</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <NumField
                    value={config?.v_min ?? 50}
                    step={10}
                    onCommit={(v) => handleUpdateConfig('v_min', v)}
                    className="w-20 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-right font-mono text-slate-100"
                  />
                  <span className="text-slate-400">mA</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-semibold text-rose-300">Van lọc: quá dòng</span>
                  <p className="text-[11px] text-slate-500">&gt; mức này 0.3s ngắt, khóa máy (E6)</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <NumField
                    value={config?.v_max ?? 1000}
                    step={50}
                    onCommit={(v) => handleUpdateConfig('v_max', v)}
                    className="w-20 bg-slate-950 border border-rose-800 rounded-lg px-2 py-1 text-right font-mono text-rose-300"
                  />
                  <span className="text-slate-400">mA</span>
                </div>
              </div>
                </>
              )}
              {config?.drain === 1 && (
                <>
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-semibold text-slate-200">Van xả: dòng tối thiểu</span>
                  <p className="text-[11px] text-slate-500">&lt; mức này 2s coi như van xả không mở (E11)</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <NumField
                    value={config?.d_vmin ?? 50}
                    step={10}
                    onCommit={(v) => handleUpdateConfig('d_vmin', v)}
                    className="w-20 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-right font-mono text-slate-100"
                  />
                  <span className="text-slate-400">mA</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-semibold text-rose-300">Van xả: quá dòng</span>
                  <p className="text-[11px] text-slate-500">&gt; mức này 0.3s ngắt, khóa máy (E12)</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <NumField
                    value={config?.d_vmax ?? 1000}
                    step={50}
                    onCommit={(v) => handleUpdateConfig('d_vmax', v)}
                    className="w-20 bg-slate-950 border border-rose-800 rounded-lg px-2 py-1 text-right font-mono text-rose-300"
                  />
                  <span className="text-slate-400">mA</span>
                </div>
              </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Accordion 3: Hiệu chuẩn TDS */}
      <div className="rounded-3xl bg-slate-900/80 border border-slate-800 overflow-hidden">
        <button
          onClick={() => toggleSection('tds_cal')}
          className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-800/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Gauge className="w-5 h-5 text-purple-400" />
            <div>
              <div className="text-sm font-bold text-slate-100">3. Hiệu chuẩn cảm biến TDS</div>
              <div className="text-xs text-slate-400">Đặt điểm 0, dung dịch chuẩn hoặc bút đo tham chiếu</div>
            </div>
          </div>
          {openSection === 'tds_cal' ? <ChevronDown className="w-5 h-5 text-slate-400" /> : <ChevronRight className="w-5 h-5 text-slate-400" />}
        </button>

        {openSection === 'tds_cal' && (
          <div className="p-4 border-t border-slate-800 space-y-4 text-xs animate-in fade-in">
            {/* Live TDS Readings */}
            <div className="grid grid-cols-2 gap-3 p-3 rounded-2xl bg-slate-950 border border-slate-800">
              <div>
                <span className="text-slate-400">TDS tức thời:</span>
                <div className="text-base font-bold font-mono text-purple-300 mt-0.5">
                  {status ? `${status.tds_live} ppm` : '—'}
                </div>
              </div>
              <div>
                <span className="text-slate-400">Hệ số hiệu chuẩn:</span>
                <div className="text-base font-bold font-mono text-cyan-300 mt-0.5">
                  {config?.tds_k ? config.tds_k.toFixed(3) : '1.000'}
                </div>
              </div>
            </div>

            {/* Diem 0: dau do kho ma van doc ra so */}
            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-bold text-slate-200">Bước 0 – Đặt điểm 0 (đầu dò khô)</div>
                  <div className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                    Nhấc đầu dò khỏi nước, lau khô. Nếu &quot;TDS tức thời&quot; không về 0 thì bấm nút này: máy lấy số đang đọc
                    làm mốc 0 ppm. Không cần bơm chạy.
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[10px] text-slate-500">Điểm 0 đang lưu</div>
                  <div className="font-mono font-bold text-cyan-300">{(config?.tds_z ?? 0).toFixed(3)} V</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleTdsZero}
                  disabled={!status}
                  className="px-4 py-2 rounded-xl font-semibold bg-cyan-700 hover:bg-cyan-600 text-white disabled:opacity-40 transition-all active:scale-95"
                >
                  Đặt số đang đọc ({status ? status.tds_live : '—'} ppm) về 0
                </button>
                {(config?.tds_z ?? 0) > 0 && (
                  <button
                    onClick={handleTdsZeroClear}
                    className="px-3 py-2 rounded-xl font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all"
                  >
                    Bỏ điểm 0
                  </button>
                )}
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Chỉ đặt khi đầu dò đang cắm vào máy và KHÔ. Máy từ chối nếu số đọc quá cao (trên khoảng 120 ppm) để tránh đặt
                nhầm lúc đầu dò còn trong nước. Đặt điểm 0 xong mới làm 3 bước hiệu chuẩn bên dưới.
              </p>
            </div>

            {/* 3 Step Guide */}
            <div className="space-y-2.5 p-3.5 rounded-2xl bg-purple-950/20 border border-purple-800/40">
              <span className="font-bold text-purple-200">Quy trình hiệu chuẩn TDS chuẩn 3 bước:</span>
              <ol className="list-decimal list-inside space-y-1 text-slate-300 leading-relaxed text-[11px]">
                <li>
                  Bấm <strong className="text-cyan-300">Lọc ngay</strong> để bơm đẩy dòng nước lưu thông liên tục qua đầu dò.
                </li>
                <li>
                  Chờ bơm chạy tối thiểu <strong className="text-purple-300">{tdsRun} giây</strong> (nước ổn định bọt khí).
                </li>
                <li>
                  Nhập chỉ số TDS đo được từ bút đo chuẩn vào ô bên dưới rồi bấm Lưu.
                </li>
              </ol>
            </div>

            {/* Run time indicator */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-slate-300">Thời gian bơm chạy liên tục:</span>
              <span
                className={`font-mono font-bold ${
                  isTdsReady ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {isPumpRunningForTds ? `${elapsedRunSeconds} giây` : 'Bơm đang tắt'}
                {isTdsReady ? ' (Đủ điều kiện)' : ` (Cần ≥ ${tdsRun}s)`}
              </span>
            </div>

            {/* Form */}
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="block text-slate-400 mb-1">Chỉ số TDS chuẩn (10–2000 ppm):</label>
                <input
                  type="number"
                  min={10}
                  max={2000}
                  value={tdsCalPpm}
                  onChange={(e) => setTdsCalPpm(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100 font-mono"
                />
              </div>
              <div className="self-end">
                <button
                  onClick={handleTdsCalibrate}
                  disabled={!isTdsReady}
                  className={`px-4 py-2.5 rounded-xl font-semibold shadow-md transition-all ${
                    isTdsReady
                      ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-950/60 active:scale-95'
                      : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                  }`}
                >
                  Lưu TDS_CAL
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Accordion 4: Hiệu chuẩn cảm biến dòng ACS712 */}
      <div className="rounded-3xl bg-slate-900/80 border border-slate-800 overflow-hidden">
        <button
          onClick={() => toggleSection('acs_cal')}
          className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-800/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Activity className="w-5 h-5 text-teal-400" />
            <div>
              <div className="text-sm font-bold text-slate-100">4. Hiệu chuẩn cảm biến dòng ACS712</div>
              <div className="text-xs text-slate-400">Đo điểm 0 A và cân chỉnh theo ampe kìm</div>
            </div>
          </div>
          {openSection === 'acs_cal' ? <ChevronDown className="w-5 h-5 text-slate-400" /> : <ChevronRight className="w-5 h-5 text-slate-400" />}
        </button>

        {openSection === 'acs_cal' && (
          <div className="p-4 border-t border-slate-800 space-y-4 text-xs animate-in fade-in">
            {/* ACS Zero Calibration */}
            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="font-semibold text-slate-200">Đo điểm 0 A (ACS_ZERO)</div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Máy sẽ đo điện áp tĩnh khi không có dòng điện đi qua. Bơm, van lọc và van xả bắt buộc phải đang tắt.
              </p>
              <div className="flex items-center justify-between pt-1">
                <span className="text-slate-400 font-mono">
                  z_p: {config?.z_p.toFixed(3)}V · z_v: {config?.z_v.toFixed(3)}V
                  {config?.drain === 1 ? ` · z_d: ${config.z_d.toFixed(3)}V` : ''}
                </span>
                <button
                  onClick={handleAcsZero}
                  disabled={status?.p[0] === 1 || status?.v[1] === 1 || status?.d[1] === 1}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-teal-600 hover:bg-teal-500 disabled:bg-slate-800 disabled:text-slate-500 text-white transition-all shadow-sm"
                >
                  Đo 0 A ngay
                </button>
              </div>
            </div>

            {/* ACS Clamp Meter Calibration */}
            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
              <div className="font-semibold text-slate-200">Chỉnh hệ số theo Ampe kìm (ACS_CAL)</div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Kênh đo phải đang chạy thực tế (dòng ≥ 50 mA). Bấm &quot;Lọc ngay&quot; trước khi đo bằng ampe kìm.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Chọn kênh:</label>
                  <select
                    value={acsChannel}
                    onChange={(e) => setAcsChannel(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-slate-100"
                  >
                    <option value={0}>Bơm lọc (ch 0)</option>
                    <option value={1}>Van lọc (ch 1)</option>
                    <option value={2}>Van xả (ch 2)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Dòng đo thực (mA):</label>
                  <input
                    type="number"
                    step={10}
                    value={acsClampMa}
                    onChange={(e) => setAcsClampMa(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 font-mono text-slate-100"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-slate-400 font-mono">
                  k_p: {config?.k_p.toFixed(1)} · k_v: {config?.k_v.toFixed(1)}
                  {config?.drain === 1 ? ` · k_d: ${config.k_d.toFixed(1)}` : ''}
                </span>
                <button
                  onClick={handleAcsCalibrate}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white transition-all shadow-sm"
                >
                  Lưu hệ số ACS_CAL
                </button>
              </div>
            </div>

            {/* Temperature offset */}
            <div className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-slate-950 border border-slate-800">
              <div>
                <div className="font-semibold text-slate-200">Bù sai số nhiệt độ</div>
                <div className="text-[11px] text-slate-400">Cân chỉnh đầu dò DS18B20 (-10 đến +10 °C)</div>
              </div>
              <div className="flex items-center gap-1.5">
                <NumField
                  value={config?.off_t ?? 0}
                  step={0.1}
                  onCommit={(v) => handleUpdateConfig('off_t', Math.round(v * 10) / 10)}
                  className="w-16 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-right font-mono text-slate-100"
                />
                <span className="text-slate-400">°C</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Accordion 5: WiFi & Nạp Firmware */}
      <div className="rounded-3xl bg-slate-900/80 border border-slate-800 overflow-hidden">
        <button
          onClick={() => toggleSection('wifi')}
          className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-800/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Wifi className="w-5 h-5 text-sky-400" />
            <div>
              <div className="text-sm font-bold text-slate-100">5. WiFi nhà & Nạp Firmware OTA</div>
              <div className="text-xs text-slate-400">Đồng bộ giờ Internet NTP, cập nhật phần mềm</div>
            </div>
          </div>
          {openSection === 'wifi' ? <ChevronDown className="w-5 h-5 text-slate-400" /> : <ChevronRight className="w-5 h-5 text-slate-400" />}
        </button>

        {openSection === 'wifi' && (
          <div className="p-4 border-t border-slate-800 space-y-4 text-xs animate-in fade-in">
            {/* Status card */}
            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">WiFi hiện tại:</span>
                <span className="font-bold text-sky-400">
                  {config?.ssid ? config.ssid : 'Chưa cấu hình'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Địa chỉ IP:</span>
                <span className="font-mono text-slate-200">
                  {status?.wifi.ip ? status.wifi.ip : '192.168.4.1'}
                </span>
              </div>
              <p className="text-[11px] text-emerald-400/90 leading-normal pt-1">
                * Khi có WiFi nhà, máy sẽ tự lấy giờ chuẩn từ Internet. Mất điện có lại máy vẫn chạy đúng lịch mà không cần mở app điện thoại.
              </p>
            </div>

            {/* Scan WiFi Action */}
            <div className="flex items-center justify-between">
              <button
                onClick={handleScanWifi}
                disabled={isScanningWifi}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-950/70 hover:bg-sky-900 border border-sky-800/50 text-sky-300 font-semibold"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isScanningWifi ? 'animate-spin' : ''}`} />
                <span>{isScanningWifi ? 'Đang dò sóng…' : 'Quét danh sách WiFi'}</span>
              </button>

              {config?.ssid && (
                <button
                  onClick={handleClearWifi}
                  className="px-3 py-1.5 rounded-xl bg-rose-950/40 hover:bg-rose-950/70 border border-rose-900/40 text-rose-300 font-medium"
                >
                  Xóa WiFi
                </button>
              )}
            </div>

            {/* Scanned WiFi List */}
            {wifiList.length > 0 && (
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {wifiList.map(([ssid, rssi, enc], i) => (
                  <button
                    key={`${ssid}_${i}`}
                    onClick={() => setSelectedSsid(ssid)}
                    className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-left transition-all ${
                      selectedSsid === ssid
                        ? 'bg-sky-950/60 border-sky-500 text-sky-200'
                        : 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Wifi className="w-3.5 h-3.5 text-sky-400" />
                      <span className="font-semibold">{ssid}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono">
                      {enc === 1 && <Lock className="w-3 h-3 text-amber-400" />}
                      <span>{rssi} dBm</span>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* WiFi Setup Form */}
            <div className="space-y-2 pt-1">
              <label className="block text-slate-400">Tên mạng (SSID):</label>
              <input
                type="text"
                value={selectedSsid}
                onChange={(e) => setSelectedSsid(e.target.value)}
                placeholder="Chọn hoặc nhập tên WiFi"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100"
              />

              <label className="block text-slate-400 pt-1">Mật khẩu WiFi:</label>
              <input
                type="password"
                value={wifiPass}
                onChange={(e) => setWifiPass(e.target.value)}
                placeholder="Để trống nếu không đổi mật khẩu"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100"
              />

              <button
                onClick={handleSaveWifi}
                disabled={!selectedSsid}
                className="w-full py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold transition-all shadow-md mt-2"
              >
                Lưu và kết nối WiFi
              </button>
            </div>

            {/* OTA Instructions */}
            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1.5 text-[11px] text-slate-400">
              <div className="font-semibold text-slate-300 flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                <span>Nạp firmware dự phòng qua WiFi máy (AP):</span>
              </div>
              <p>
                Kết nối điện thoại vào WiFi do máy phát:{' '}
                <strong className="text-cyan-300 font-mono">{config?.ap || 'CITO-UF-XXXX'}</strong> (mật khẩu:{' '}
                <code className="text-slate-200">citocito</code>), sau đó mở trình duyệt truy cập{' '}
                <span className="text-cyan-300 underline font-mono">http://192.168.4.1</span> để nạp file .bin.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Accordion 6: Thông tin máy & Hệ thống */}
      <div className="rounded-3xl bg-slate-900/80 border border-slate-800 overflow-hidden">
        <button
          onClick={() => toggleSection('system')}
          className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-800/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Cpu className="w-5 h-5 text-slate-400" />
            <div>
              <div className="text-sm font-bold text-slate-100">6. Thông tin máy & Quản trị hệ thống</div>
              <div className="text-xs text-slate-400">Đổi PIN, RAM, phiên bản firmware, khởi động lại</div>
            </div>
          </div>
          {openSection === 'system' ? <ChevronDown className="w-5 h-5 text-slate-400" /> : <ChevronRight className="w-5 h-5 text-slate-400" />}
        </button>

        {openSection === 'system' && (
          <div className="p-4 border-t border-slate-800 space-y-4 text-xs animate-in fade-in">
            {/* System Info Grid */}
            <div className="grid grid-cols-2 gap-2.5 p-3 rounded-2xl bg-slate-950 border border-slate-800">
              <div>
                <span className="text-slate-500">Phiên bản Firmware:</span>
                <div className="font-mono font-bold text-slate-200 mt-0.5">{config?.fw || '—'}</div>
              </div>
              <div>
                <span className="text-slate-500">Mã thiết bị (MAC):</span>
                <div className="font-mono font-bold text-slate-200 mt-0.5">{config?.dev || '—'}</div>
              </div>
              <div>
                <span className="text-slate-500">Lý do khởi động:</span>
                <div className="font-mono font-bold text-amber-300 mt-0.5">
                  {config?.rst || 'POWERON'}
                  {(config?.rst === 'WDT' || config?.rst === 'PANIC' || config?.rst === 'BROWNOUT') && (
                    <span className="text-[10px] text-rose-400 block font-normal">(Từng bị treo/sụt nguồn)</span>
                  )}
                </div>
              </div>
              <div>
                <span className="text-slate-500">Thời gian chạy (Uptime):</span>
                <div className="font-mono font-bold text-slate-200 mt-0.5">
                  {status ? formatDuration(status.up) : '—'}
                </div>
              </div>
              <div>
                <span className="text-slate-500">Bộ nhớ RAM trống:</span>
                <div className="font-mono text-slate-300 mt-0.5">
                  {status ? `${Math.round(status.heap / 1024)} KB` : '—'}
                </div>
              </div>
              <div>
                <span className="text-slate-500">Đồng hồ máy:</span>
                <div className="font-bold mt-0.5">
                  {status?.tk === 1 ? (
                    <span className="text-emerald-400">Đã chuẩn giờ</span>
                  ) : (
                    <span className="text-rose-400">Chưa có giờ</span>
                  )}
                </div>
              </div>
            </div>

            {config?.pend === 1 && (
              <div className="p-3 rounded-xl bg-amber-950/60 border border-amber-600/50 text-amber-200 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                <span>Firmware mới nạp, đang trong thời gian xác nhận 60 giây.</span>
              </div>
            )}

            {/* PIN change */}
            <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
              <span className="font-semibold text-slate-200">Đổi mã PIN bảo mật máy</span>
              <div className="flex gap-2">
                <input
                  type="password"
                  maxLength={8}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value)}
                  placeholder="Nhập PIN mới (4–8 số)"
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-slate-100 font-mono text-center"
                />
                <button
                  onClick={handleSetPin}
                  disabled={!newPin}
                  className="px-3.5 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-semibold"
                >
                  Lưu PIN
                </button>
              </div>
            </div>

            {/* Critical actions */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={handleFactoryReset}
                className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-slate-950 hover:bg-orange-950/40 border border-slate-800 hover:border-orange-800/60 text-orange-400 font-semibold transition-all"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Về mặc định</span>
              </button>

              <button
                onClick={handleReboot}
                className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-slate-950 hover:bg-rose-950/40 border border-slate-800 hover:border-rose-800/60 text-rose-400 font-semibold transition-all"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Khởi động lại</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
