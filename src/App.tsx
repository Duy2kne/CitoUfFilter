/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  Calendar,
  Clock,
  Droplets,
  Home,
  Sliders,
  Sparkles,
  WifiOff,
} from 'lucide-react';
import { ConfirmModal } from './components/ConfirmModal';
import { ConnectModal } from './components/ConnectModal';
import { HistoryTab } from './components/HistoryTab';
import { HomeTab } from './components/HomeTab';
import { Navbar } from './components/Navbar';
import { PinModal } from './components/PinModal';
import { ScheduleTab } from './components/ScheduleTab';
import { TechTab } from './components/TechTab';
import { ToastContainer, ToastItem } from './components/Toast';
import { ConnectionState, UfBleManager } from './services/bleService';
import { applyPacket, INITIAL_APP_STATE } from './services/packetParser';
import { DEFAULT_PIN, STORAGE_KEY_PIN } from './types/system';

type ActiveTab = 'home' | 'schedule' | 'history' | 'tech';

export default function App() {
  const ble = UfBleManager.getInstance();

  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [deviceName, setDeviceName] = useState<string>('');
  const [activeTab, setActiveTab] = useState<ActiveTab>('home');
  const [appState, setAppState] = useState(INITIAL_APP_STATE);

  // Modals & UI States
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [pinErrorMessage, setPinErrorMessage] = useState('');
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    isDangerous: boolean;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    isDangerous: false,
    onConfirm: () => {},
  });

  // Toasts
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = (type: 'success' | 'error' | 'info', message: string) => {
    const id = `${Date.now()}_${Math.random()}`;
    setToasts((prev) => [...prev.slice(-4), { id, type, message }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  useEffect(() => {
    // 1. Subscribe to connection state
    const unsubState = ble.addStateListener((state, name) => {
      setConnectionState(state);
      setDeviceName(name || '');
      if (state === 'disconnected') {
        // Clear realtime status so we don't display fake stale numbers
        setAppState((prev) => ({
          ...prev,
          status: null,
        }));
      }
    });

    // 2. Subscribe to incoming packets via pure applyPacket reducer
    const unsubPacket = ble.addPacketListener((pkt) => {
      setAppState((prev) => applyPacket(prev, pkt));
    });

    // 3. Subscribe to auth error (opens PinModal)
    const unsubAuth = ble.addAuthErrorListener((msg) => {
      setPinErrorMessage(msg);
      setIsPinModalOpen(true);
    });

    // 4. Subscribe to toasts
    const unsubToast = ble.addToastListener((type, msg) => {
      addToast(type, msg);
    });

    return () => {
      unsubState();
      unsubPacket();
      unsubAuth();
      unsubToast();
    };
  }, []);

  const handleSendCommand = async (action: string, params: Record<string, unknown> = {}) => {
    if (connectionState !== 'connected' && connectionState !== 'demo') {
      addToast('info', 'Chưa kết nối máy. Vui lòng bấm Kết nối hoặc vào chế độ Demo.');
      setIsConnectModalOpen(true);
      return { t: 'ack', a: action, ok: false, msg: 'Chưa kết nối Bluetooth với máy' };
    }

    try {
      return await ble.sendCommand(action, params);
    } catch (err: unknown) {
      const error = err as Error;
      addToast('error', error.message || 'Lỗi gửi lệnh đến máy');
      return { t: 'ack', a: action, ok: false, msg: error.message };
    }
  };

  const requestConfirm = (
    title: string,
    message: string,
    onConfirm: () => void | Promise<unknown>,
    isDangerous = false
  ) => {
    setConfirmConfig({
      isOpen: true,
      title,
      message,
      isDangerous,
      onConfirm: async () => {
        setConfirmConfig((prev) => ({ ...prev, isOpen: false }));
        try {
          await onConfirm();
        } catch (err: unknown) {
          const error = err as Error;
          addToast('error', error.message || 'Thao tác không thành công');
        }
      },
    });
  };

  const isConnected = connectionState === 'connected' || connectionState === 'demo';

  return (
    <div className="min-h-screen bg-[#070d18] text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-white">
      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />

      {/* Top Navbar */}
      <Navbar
        connectionState={connectionState}
        deviceName={deviceName}
        onOpenConnectModal={() => setIsConnectModalOpen(true)}
        onDisconnect={() => ble.disconnect()}
        onReconnect={() => ble.reconnect()}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 pt-4 pb-24 sm:pb-12">
        {/* Banner if disconnected */}
        {!isConnected && (
          <div className="mb-5 p-4 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3 text-center sm:text-left">
              <div className="w-10 h-10 rounded-2xl bg-slate-800 text-slate-400 flex items-center justify-center shrink-0">
                <WifiOff className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-bold text-slate-200">Chưa kết nối máy lọc nước</div>
                <div className="text-xs text-slate-400">
                  Bấm &quot;Kết nối Bluetooth&quot; hoặc dùng &quot;Chế độ Thử nghiệm&quot; để trải nghiệm.
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                onClick={() => setIsConnectModalOpen(true)}
                className="flex-1 sm:flex-initial px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 shadow-md shadow-cyan-950/50 transition-all active:scale-95"
              >
                Kết nối ngay
              </button>
              <button
                onClick={() => ble.startDemo()}
                className="flex-1 sm:flex-initial px-3.5 py-2 rounded-xl text-xs font-semibold text-indigo-300 bg-indigo-950/70 hover:bg-indigo-900/90 border border-indigo-800/60 transition-all"
              >
                Vào Demo
              </button>
            </div>
          </div>
        )}

        {/* Tab Navigation (Desktop / Tablet Header Pill Bar) */}
        <div className="hidden sm:flex items-center gap-2 mb-6 p-1.5 bg-slate-900/90 rounded-2xl border border-slate-800 max-w-md">
          <button
            onClick={() => setActiveTab('home')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'home'
                ? 'bg-cyan-600 text-white shadow-md shadow-cyan-950/50'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Home className="w-4 h-4" />
            <span>Trang chính</span>
          </button>

          <button
            onClick={() => setActiveTab('schedule')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'schedule'
                ? 'bg-cyan-600 text-white shadow-md shadow-cyan-950/50'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>Lịch lọc</span>
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'history'
                ? 'bg-cyan-600 text-white shadow-md shadow-cyan-950/50'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Nhật ký</span>
          </button>

          <button
            onClick={() => setActiveTab('tech')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'tech'
                ? 'bg-cyan-600 text-white shadow-md shadow-cyan-950/50'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>Kỹ thuật</span>
          </button>
        </div>

        {/* Tab 1: Trang chính */}
        {activeTab === 'home' && (
          <HomeTab
            status={appState.status}
            config={appState.config}
            onSendCommand={handleSendCommand}
            onNavigateTab={(tab) => setActiveTab(tab)}
            onRequestConfirm={requestConfirm}
          />
        )}

        {/* Tab 2: Lịch lọc */}
        {activeTab === 'schedule' && (
          <ScheduleTab config={appState.config} onSendCommand={handleSendCommand} />
        )}

        {/* Tab 3: Nhật ký */}
        {activeTab === 'history' && (
          <HistoryTab
            history={appState.history}
            isConnected={isConnected}
            onSendCommand={handleSendCommand}
            onRequestConfirm={requestConfirm}
          />
        )}

        {/* Tab 4: Kỹ thuật */}
        {activeTab === 'tech' && (
          <TechTab
            status={appState.status}
            config={appState.config}
            wifiList={appState.wifiList}
            isDemo={ble.isDemo()}
            onSendCommand={handleSendCommand}
            onRequestConfirm={requestConfirm}
            onInjectDemoFault={(code) => ble.demoInjectFault(code)}
            onClearDemoFaults={() => ble.demoClearFaults()}
          />
        )}
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-950/95 backdrop-blur-lg border-t border-slate-800/80 px-2 py-2">
        <div className="grid grid-cols-4 gap-1">
          <button
            onClick={() => setActiveTab('home')}
            className={`flex flex-col items-center justify-center py-2 px-1 rounded-2xl transition-all ${
              activeTab === 'home'
                ? 'text-cyan-400 bg-cyan-950/60 font-bold'
                : 'text-slate-400 hover:text-slate-200 font-medium'
            }`}
          >
            <Home className="w-5 h-5 mb-1" />
            <span className="text-[10px]">Trang chính</span>
          </button>

          <button
            onClick={() => setActiveTab('schedule')}
            className={`flex flex-col items-center justify-center py-2 px-1 rounded-2xl transition-all ${
              activeTab === 'schedule'
                ? 'text-cyan-400 bg-cyan-950/60 font-bold'
                : 'text-slate-400 hover:text-slate-200 font-medium'
            }`}
          >
            <Calendar className="w-5 h-5 mb-1" />
            <span className="text-[10px]">Lịch lọc</span>
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`flex flex-col items-center justify-center py-2 px-1 rounded-2xl transition-all ${
              activeTab === 'history'
                ? 'text-cyan-400 bg-cyan-950/60 font-bold'
                : 'text-slate-400 hover:text-slate-200 font-medium'
            }`}
          >
            <Clock className="w-5 h-5 mb-1" />
            <span className="text-[10px]">Nhật ký</span>
          </button>

          <button
            onClick={() => setActiveTab('tech')}
            className={`flex flex-col items-center justify-center py-2 px-1 rounded-2xl transition-all ${
              activeTab === 'tech'
                ? 'text-cyan-400 bg-cyan-950/60 font-bold'
                : 'text-slate-400 hover:text-slate-200 font-medium'
            }`}
          >
            <Sliders className="w-5 h-5 mb-1" />
            <span className="text-[10px]">Kỹ thuật</span>
          </button>
        </div>
      </nav>

      {/* Connect Modal */}
      <ConnectModal
        isOpen={isConnectModalOpen}
        isBluetoothSupported={ble.isBluetoothSupported()}
        onConnectBluetooth={async () => {
          try {
            await ble.connect();
          } catch {
            // Already handled in bleService toasts
          }
        }}
        onStartDemo={() => ble.startDemo()}
        onClose={() => setIsConnectModalOpen(false)}
      />

      {/* PIN Authentication Error Modal */}
      <PinModal
        isOpen={isPinModalOpen}
        errorMessage={pinErrorMessage}
        currentPin={localStorage.getItem(STORAGE_KEY_PIN) || DEFAULT_PIN}
        onSaveAndAuth={(pin) => {
          setIsPinModalOpen(false);
          ble.sendAuth(pin);
        }}
        onClose={() => setIsPinModalOpen(false)}
      />

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmConfig.isOpen}
        title={confirmConfig.title}
        message={confirmConfig.message}
        isDangerous={confirmConfig.isDangerous}
        onConfirm={confirmConfig.onConfirm}
        onCancel={() => setConfirmConfig((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
