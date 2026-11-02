/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Bluetooth, Droplets, RefreshCw, Unplug } from 'lucide-react';
import { ConnectionState } from '../services/bleService';

interface NavbarProps {
  connectionState: ConnectionState;
  deviceName: string;
  onOpenConnectModal: () => void;
  onDisconnect: () => void;
  onReconnect: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  connectionState,
  deviceName,
  onOpenConnectModal,
  onDisconnect,
  onReconnect,
}) => {
  const isConnected = connectionState === 'connected';
  const isDemo = connectionState === 'demo';
  const isReconnecting = connectionState === 'reconnecting';
  const isConnecting = connectionState === 'connecting';

  return (
    <header className="sticky top-0 z-40 bg-slate-950/85 backdrop-blur-md border-b border-slate-800/80 px-4 py-3">
      <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
        {/* Brand / Logo */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center shrink-0 shadow-md shadow-cyan-950/60 text-white">
            <Droplets className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-extrabold tracking-tight text-slate-100 text-sm sm:text-base truncate">
                CITO UF
              </span>
              <span className="text-[10px] font-bold tracking-wider uppercase text-cyan-400 bg-cyan-950/80 px-1.5 py-0.5 rounded border border-cyan-800/40">
                FILTER
              </span>
              {isDemo && (
                <span className="text-[10px] font-bold tracking-wider uppercase text-amber-300 bg-amber-950/90 px-1.5 py-0.5 rounded border border-amber-800/60 shadow-sm animate-pulse">
                  DEMO
                </span>
              )}
            </div>
            {/* Device Name Subtext */}
            <div className="text-[11px] text-slate-400 truncate flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full inline-block shrink-0 ${
                  isConnected
                    ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                    : isDemo
                    ? 'bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.8)]'
                    : isReconnecting || isConnecting
                    ? 'bg-amber-400 animate-ping'
                    : 'bg-slate-600'
                }`}
              />
              <span className="truncate">
                {isDemo
                  ? 'Máy mô phỏng'
                  : isConnected
                  ? deviceName || 'CITO-UF'
                  : isReconnecting
                  ? 'Đang kết nối lại…'
                  : isConnecting
                  ? 'Đang tìm máy…'
                  : 'Chưa kết nối'}
              </span>
            </div>
          </div>
        </div>

        {/* Right Connection Controls */}
        <div className="flex items-center gap-2 shrink-0">
          {isConnected || isDemo ? (
            <button
              onClick={onDisconnect}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-rose-300 bg-slate-900 hover:bg-rose-950/40 border border-slate-700/80 hover:border-rose-800/60 rounded-xl transition-all"
              title="Ngắt kết nối máy"
            >
              <Unplug className="w-3.5 h-3.5" />
              <span className="hidden xs:inline">Ngắt kết nối</span>
            </button>
          ) : isReconnecting ? (
            <button
              onClick={onReconnect}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-300 bg-amber-950/60 border border-amber-800/50 rounded-xl animate-pulse"
            >
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Nối lại</span>
            </button>
          ) : (
            <button
              onClick={onOpenConnectModal}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 border border-cyan-400/30 rounded-xl shadow-md shadow-cyan-950/50 transition-all active:scale-95"
            >
              <Bluetooth className="w-3.5 h-3.5" />
              <span>Kết nối</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
