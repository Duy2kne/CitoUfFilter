/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Bluetooth, Check, Compass, HelpCircle, Key, Laptop, Smartphone, Sparkles, X } from 'lucide-react';
import { DEFAULT_PIN, STORAGE_KEY_PIN } from '../types/system';

interface ConnectModalProps {
  isOpen: boolean;
  isBluetoothSupported: boolean;
  onConnectBluetooth: () => void;
  onStartDemo: () => void;
  onClose: () => void;
}

export const ConnectModal: React.FC<ConnectModalProps> = ({
  isOpen,
  isBluetoothSupported,
  onConnectBluetooth,
  onStartDemo,
  onClose,
}) => {
  const [pin, setPin] = useState(() => localStorage.getItem(STORAGE_KEY_PIN) || DEFAULT_PIN);
  const [pinSaved, setPinSaved] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  if (!isOpen) return null;

  const handleSavePin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length >= 4 && pin.length <= 8) {
      localStorage.setItem(STORAGE_KEY_PIN, pin);
      setPinSaved(true);
      setTimeout(() => setPinSaved(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl relative overflow-hidden max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-slate-200 transition-colors"
          aria-label="Đóng"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-12 h-12 rounded-2xl bg-cyan-950/80 border border-cyan-800/60 text-cyan-400 flex items-center justify-center shrink-0 shadow-lg shadow-cyan-950/50">
            <Bluetooth className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-100">Kết nối máy lọc CITO UF</h2>
            <p className="text-xs text-slate-400">Bluetooth Low Energy · Firmware 1.0.0</p>
          </div>
        </div>

        {/* Primary Action Buttons */}
        <div className="space-y-3 mb-6">
          <button
            onClick={() => {
              onClose();
              onConnectBluetooth();
            }}
            disabled={!isBluetoothSupported}
            className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all ${
              isBluetoothSupported
                ? 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white border-cyan-400/30 shadow-lg shadow-cyan-950/60 active:scale-[0.99]'
                : 'bg-slate-800/50 text-slate-500 border-slate-700/50 cursor-not-allowed'
            }`}
          >
            <div className="flex items-center gap-3.5 text-left">
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                <Bluetooth className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="text-sm font-semibold">Tìm thiết bị Bluetooth</div>
                <div className="text-xs text-cyan-100/80">Quét máy CITO-UF-XXXX ở gần bạn</div>
              </div>
            </div>
          </button>

          <button
            onClick={() => {
              onClose();
              onStartDemo();
            }}
            className="w-full flex items-center justify-between p-4 rounded-2xl bg-slate-800/70 hover:bg-slate-800 border border-slate-700/80 text-slate-100 transition-all hover:border-slate-600 active:scale-[0.99]"
          >
            <div className="flex items-center gap-3.5 text-left">
              <div className="w-10 h-10 rounded-xl bg-indigo-950 border border-indigo-800/50 text-indigo-400 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-semibold flex items-center gap-2">
                  <span>Chế độ Thử nghiệm (Demo)</span>
                  <span className="px-1.5 py-0.2 text-[10px] uppercase font-bold tracking-wider bg-indigo-500/20 text-indigo-300 rounded border border-indigo-500/30">
                    Ảo
                  </span>
                </div>
                <div className="text-xs text-slate-400">Trải nghiệm đầy đủ tính năng không cần máy thật</div>
              </div>
            </div>
          </button>
        </div>

        {/* PIN Management Box */}
        <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800/80 mb-5">
          <form onSubmit={handleSavePin} className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-cyan-400" />
                <span>Mã PIN ghi nhớ trong trình duyệt:</span>
              </label>
              {pinSaved && (
                <span className="text-[11px] text-emerald-400 flex items-center gap-1">
                  <Check className="w-3 h-3" /> Đã lưu
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                maxLength={8}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="1234"
                className="flex-1 bg-slate-900 border border-slate-700 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 rounded-xl px-3 py-1.5 text-slate-100 font-mono text-center text-sm outline-none"
              />
              <button
                type="submit"
                className="px-3 py-1.5 text-xs font-medium text-cyan-300 bg-cyan-950/70 hover:bg-cyan-900 border border-cyan-800/60 rounded-xl transition-colors"
              >
                Lưu PIN
              </button>
            </div>
            <p className="text-[11px] text-slate-500 leading-normal">
              Mã PIN mặc định là <strong className="text-slate-400">1234</strong>. App tự động gửi khi kết nối để không phải nhập lại mỗi lần.
            </p>
          </form>
        </div>

        {/* Browser Guide Accordion */}
        <div className="border-t border-slate-800/80 pt-4">
          <button
            onClick={() => setShowGuide(!showGuide)}
            className="w-full flex items-center justify-between text-xs text-slate-400 hover:text-slate-200 transition-colors py-1"
          >
            <span className="flex items-center gap-1.5">
              <HelpCircle className="w-4 h-4 text-cyan-400" />
              <span>Hướng dẫn tương thích trình duyệt</span>
            </span>
            <span className="text-cyan-400 font-medium">{showGuide ? 'Thu gọn' : 'Xem chi tiết'}</span>
          </button>

          {showGuide && (
            <div className="mt-3 space-y-3 text-xs text-slate-300 bg-slate-950/50 p-3.5 rounded-2xl border border-slate-800/60">
              <div className="flex items-start gap-2.5">
                <Laptop className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-slate-200">Máy tính & Android:</strong> Dùng trình duyệt{' '}
                  <span className="text-cyan-300 font-medium">Google Chrome</span>,{' '}
                  <span className="text-cyan-300 font-medium">Microsoft Edge</span>, Opera hoặc Samsung Internet.
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <Smartphone className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-slate-200">iPhone / iPad (iOS):</strong> Safari mặc định không có Web Bluetooth.
                  Hãy cài app miễn phí <span className="text-indigo-300 font-medium">Bluefy – Web BLE Browser</span> từ App Store và mở web trong app đó.
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <Compass className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-slate-200">Lưu ý bật Bluetooth:</strong> Bật Bluetooth trên điện thoại/máy tính trước khi quét. Máy lọc sẽ có tên dạng{' '}
                  <code className="text-cyan-300 font-mono">CITO-UF-XXXX</code>.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
