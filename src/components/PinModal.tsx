/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { KeyRound, ShieldAlert, X } from 'lucide-react';

interface PinModalProps {
  isOpen: boolean;
  errorMessage?: string;
  currentPin: string;
  onSaveAndAuth: (pin: string) => void;
  onClose: () => void;
}

export const PinModal: React.FC<PinModalProps> = ({
  isOpen,
  errorMessage,
  currentPin,
  onSaveAndAuth,
  onClose,
}) => {
  const [pin, setPin] = useState(currentPin);
  const [validationError, setValidationError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length < 4 || pin.length > 8) {
      setValidationError('Mã PIN phải từ 4 đến 8 ký tự.');
      return;
    }
    setValidationError('');
    onSaveAndAuth(pin);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-5 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 transition-colors"
          aria-label="Đóng"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-amber-950/70 border border-amber-800/50 text-amber-400 flex items-center justify-center shrink-0">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-100">Nhập mã PIN máy lọc</h3>
            <p className="text-xs text-slate-400">Mặc định: 1234</p>
          </div>
        </div>

        {errorMessage && (
          <div className="flex items-start gap-2.5 p-3 my-3 rounded-xl bg-rose-950/50 border border-rose-800/60 text-rose-300 text-xs leading-relaxed">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
            <span>{errorMessage}. Sai 5 lần liên tiếp máy sẽ tự động ngắt Bluetooth để bảo vệ an toàn.</span>
          </div>
        )}

        {validationError && (
          <div className="text-rose-400 text-xs mb-2">{validationError}</div>
        )}

        <form onSubmit={handleSubmit} className="mt-3">
          <label className="block text-xs font-medium text-slate-300 mb-1.5">
            Mã PIN (4–8 ký tự)
          </label>
          <input
            type="password"
            autoFocus
            maxLength={8}
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="1234"
            className="w-full bg-slate-950 border border-slate-700 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 rounded-xl px-3.5 py-2.5 text-slate-100 text-center tracking-widest text-lg font-mono outline-none transition-all mb-4"
          />

          <div className="flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800/70 rounded-xl transition-colors"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-sm font-medium text-white bg-cyan-600 hover:bg-cyan-500 rounded-xl shadow-md shadow-cyan-950/50 transition-all"
            >
              Đăng nhập
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
