/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  DEFAULT_PIN,
  STORAGE_KEY_LAST_DEVICE,
  STORAGE_KEY_PIN,
  UF_COMMAND_UUID,
  UF_SERVICE_UUID,
  UF_STATUS_UUID,
  UfAckPacket,
  UfIncomingPacket,
} from '../types/system';
import { UfDemoDevice } from './demo';
import { PacketAssembler } from './packetParser';

export type ConnectionState = 'disconnected' | 'connecting' | 'reconnecting' | 'connected' | 'demo';

export interface CommandQueueItem {
  action: string;
  params?: Record<string, unknown>;
  resolve: (ack: UfAckPacket) => void;
  reject: (err: Error) => void;
}

export type PacketListener = (pkt: UfIncomingPacket) => void;
export type StateListener = (state: ConnectionState, deviceName?: string) => void;
export type AuthErrorListener = (message: string) => void;
export type ToastListener = (type: 'success' | 'error' | 'info', message: string) => void;

// Web Bluetooth API TypeScript declarations
interface BluetoothDevice extends EventTarget {
  id: string;
  name?: string;
  gatt?: BluetoothRemoteGATTServer;
  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void;
  watchAdvertisements?: () => Promise<void>;
}

interface BluetoothRemoteGATTServer {
  device: BluetoothDevice;
  connected: boolean;
  connect(): Promise<BluetoothRemoteGATTServer>;
  disconnect(): void;
  getPrimaryService(service: string): Promise<BluetoothRemoteGATTService>;
}

interface BluetoothRemoteGATTService {
  getCharacteristic(characteristic: string): Promise<BluetoothRemoteGATTCharacteristic>;
}

interface BluetoothRemoteGATTCharacteristic extends EventTarget {
  value?: DataView;
  startNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
  stopNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
  writeValueWithResponse?(data: BufferSource): Promise<void>;
  writeValue?(data: BufferSource): Promise<void>;
  writeValueWithoutResponse?(data: BufferSource): Promise<void>;
  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
}

interface NavigatorWithBluetooth extends Navigator {
  bluetooth?: {
    requestDevice(options: {
      filters?: Array<{ namePrefix?: string; services?: string[] }>;
      optionalServices?: string[];
    }): Promise<BluetoothDevice>;
    getDevices?(): Promise<BluetoothDevice[]>;
  };
}

export class UfBleManager {
  private static instance: UfBleManager | null = null;

  private device: BluetoothDevice | null = null;
  private server: BluetoothRemoteGATTServer | null = null;
  private statusChar: BluetoothRemoteGATTCharacteristic | null = null;
  private commandChar: BluetoothRemoteGATTCharacteristic | null = null;

  private assembler = new PacketAssembler();
  private connectionState: ConnectionState = 'disconnected';
  private currentDeviceName: string = '';
  private demoDevice: UfDemoDevice | null = null;

  // Command queue & concurrency
  private commandQueue: CommandQueueItem[] = [];
  private isProcessingCommand = false;
  private pendingAck: {
    action: string;
    timer: ReturnType<typeof setTimeout>;
    resolve: (ack: UfAckPacket) => void;
    reject: (err: Error) => void;
  } | null = null;

  // Event Listeners
  private packetListeners: Set<PacketListener> = new Set();
  private stateListeners: Set<StateListener> = new Set();
  private authErrorListeners: Set<AuthErrorListener> = new Set();
  private toastListeners: Set<ToastListener> = new Set();

  // Reconnection state
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private reconnectTimers: number[] = [2000, 4000, 6000];
  private isIntentionalDisconnect = false;
  private lastTimeSync = 0;

  private constructor() {
    // Singleton
  }

  public static getInstance(): UfBleManager {
    if (!UfBleManager.instance) {
      UfBleManager.instance = new UfBleManager();
    }
    return UfBleManager.instance;
  }

  public isBluetoothSupported(): boolean {
    const nav = navigator as NavigatorWithBluetooth;
    return typeof nav !== 'undefined' && Boolean(nav.bluetooth && nav.bluetooth.requestDevice);
  }

  public getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  public getDeviceName(): string {
    return this.currentDeviceName;
  }

  public isDemo(): boolean {
    return this.connectionState === 'demo';
  }

  public addPacketListener(cb: PacketListener): () => void {
    this.packetListeners.add(cb);
    return () => this.packetListeners.delete(cb);
  }

  public addStateListener(cb: StateListener): () => void {
    this.stateListeners.add(cb);
    cb(this.connectionState, this.currentDeviceName);
    return () => this.stateListeners.delete(cb);
  }

  public addAuthErrorListener(cb: AuthErrorListener): () => void {
    this.authErrorListeners.add(cb);
    return () => this.authErrorListeners.delete(cb);
  }

  public addToastListener(cb: ToastListener): () => void {
    this.toastListeners.add(cb);
    return () => this.toastListeners.delete(cb);
  }

  private setConnectionState(newState: ConnectionState, name?: string) {
    this.connectionState = newState;
    if (name !== undefined) {
      this.currentDeviceName = name;
    }
    this.stateListeners.forEach((cb) => cb(this.connectionState, this.currentDeviceName));
  }

  private notifyPacket(pkt: UfIncomingPacket) {
    // Intercept acks for command queue resolution
    if (pkt.t === 'ack') {
      this.handleAckPacket(pkt as UfAckPacket);
    }

    // Intercept time sync checks
    if (pkt.t === 'st' && pkt.tk === 0) {
      const now = Date.now();
      if (now - this.lastTimeSync > 30000) {
        this.lastTimeSync = now;
        this.sendTimeSync();
      }
    }

    this.packetListeners.forEach((cb) => cb(pkt));
  }

  private notifyToast(type: 'success' | 'error' | 'info', message: string) {
    this.toastListeners.forEach((cb) => cb(type, message));
  }

  /**
   * Start Demo Mode (simulated virtual device in browser)
   */
  public startDemo() {
    this.disconnect();
    this.demoDevice = new UfDemoDevice();
    this.demoDevice.setPacketCallback((pkt) => this.notifyPacket(pkt));
    this.demoDevice.start();
    this.setConnectionState('demo', 'CITO-UF-DEMO');

    // Auto authenticate demo device with default PIN
    setTimeout(() => {
      this.demoDevice?.handleCommand('AUTH', { pin: DEFAULT_PIN });
    }, 100);
  }

  /**
   * Stop Demo Mode
   */
  public stopDemo() {
    if (this.demoDevice) {
      this.demoDevice.stop();
      this.demoDevice = null;
    }
    this.setConnectionState('disconnected', '');
  }

  /**
   * Connect to real physical Bluetooth device
   */
  public async connect(): Promise<void> {
    if (!this.isBluetoothSupported()) {
      throw new Error('Trình duyệt không hỗ trợ Web Bluetooth. Vui lòng dùng Chrome, Edge hoặc app Bluefy.');
    }

    if (this.demoDevice) {
      this.stopDemo();
    }

    const nav = navigator as NavigatorWithBluetooth;
    this.isIntentionalDisconnect = false;
    this.reconnectAttempts = 0;

    try {
      this.setConnectionState('connecting', 'Đang quét thiết bị…');
      const device = await nav.bluetooth!.requestDevice({
        filters: [
          { namePrefix: 'CITO-UF' },
          { services: [UF_SERVICE_UUID] },
        ],
        optionalServices: [UF_SERVICE_UUID],
      });

      this.device = device;
      this.currentDeviceName = device.name || 'CITO-UF';
      localStorage.setItem(STORAGE_KEY_LAST_DEVICE, device.id);

      device.addEventListener('gattserverdisconnected', () => {
        this.onDisconnected();
      });

      await this.initGattConnection(device);
    } catch (err: unknown) {
      const error = err as Error;
      if (error.name !== 'NotFoundError') {
        // User didn't cancel selection
        this.notifyToast('error', `Kết nối thất bại: ${error.message}`);
      }
      this.setConnectionState('disconnected', '');
      throw err;
    }
  }

  private async initGattConnection(device: BluetoothDevice) {
    if (!device.gatt) {
      throw new Error('Không thể kết nối GATT server');
    }

    this.server = await device.gatt.connect();
    const service = await this.server.getPrimaryService(UF_SERVICE_UUID);

    this.statusChar = await service.getCharacteristic(UF_STATUS_UUID);
    this.commandChar = await service.getCharacteristic(UF_COMMAND_UUID);

    this.assembler.reset();

    // Listen to incoming packets on STATUS characteristic
    this.statusChar.addEventListener('characteristicvaluechanged', (event: Event) => {
      const char = event.target as BluetoothRemoteGATTCharacteristic;
      if (char.value) {
        const packets = this.assembler.pushChunk(char.value);
        for (const pkt of packets) {
          this.notifyPacket(pkt);
        }
      }
    });

    await this.statusChar.startNotifications();
    this.setConnectionState('connected', device.name || 'CITO-UF');
    this.reconnectAttempts = 0;

    // Immediately send AUTH with saved PIN
    const savedPin = localStorage.getItem(STORAGE_KEY_PIN) || DEFAULT_PIN;
    this.sendAuth(savedPin);
  }

  private onDisconnected() {
    this.server = null;
    this.statusChar = null;
    this.commandChar = null;
    this.failPendingCommand(new Error('Mất kết nối Bluetooth'));

    if (this.isIntentionalDisconnect) {
      this.setConnectionState('disconnected', '');
      return;
    }

    // Auto-reconnect up to 3 times
    if (this.reconnectAttempts < this.maxReconnectAttempts && this.device) {
      const delay = this.reconnectTimers[this.reconnectAttempts] || 3000;
      this.reconnectAttempts++;
      this.setConnectionState('reconnecting', `Đang kết nối lại (${this.reconnectAttempts}/${this.maxReconnectAttempts})…`);

      setTimeout(async () => {
        try {
          if (this.device && !this.isIntentionalDisconnect) {
            await this.initGattConnection(this.device);
          }
        } catch {
          // If this retry fails, onDisconnected is retriggered or handled next
        }
      }, delay);
    } else {
      this.setConnectionState('disconnected', '');
      this.notifyToast('error', 'Đã ngắt kết nối với máy lọc nước.');
    }
  }

  public disconnect() {
    this.isIntentionalDisconnect = true;
    if (this.demoDevice) {
      this.stopDemo();
      return;
    }
    if (this.server && this.server.connected) {
      this.server.disconnect();
    }
    this.device = null;
    this.server = null;
    this.statusChar = null;
    this.commandChar = null;
    this.setConnectionState('disconnected', '');
  }

  /**
   * Reconnect to the currently paired device
   */
  public async reconnect(): Promise<void> {
    if (this.device) {
      this.isIntentionalDisconnect = false;
      this.reconnectAttempts = 0;
      this.setConnectionState('reconnecting', 'Đang kết nối lại…');
      await this.initGattConnection(this.device);
    } else {
      await this.connect();
    }
  }

  /**
   * Send AUTH handshake
   */
  public sendAuth(pin: string) {
    this.sendCommand('AUTH', { pin })
      .then((ack) => {
        if (ack.ok) {
          localStorage.setItem(STORAGE_KEY_PIN, pin);
          this.notifyToast('success', 'Đã xác thực thành công');
          // Send local phone time immediately after AUTH
          this.sendTimeSync();
        } else {
          const msg = ack.msg || 'Mã PIN không đúng';
          this.authErrorListeners.forEach((cb) => cb(msg));
        }
      })
      .catch((err) => {
        this.notifyToast('error', `Lỗi xác thực: ${err.message}`);
      });
  }

  /**
   * Sends phone's local time: Date.now()/1000 - getTimezoneOffset()*60
   */
  public sendTimeSync() {
    const localEpochSeconds = Math.floor(Date.now() / 1000 - new Date().getTimezoneOffset() * 60);
    this.sendCommand('TIME_SET', { t: localEpochSeconds }).catch(() => {
      // Ignored if device is busy
    });
  }

  /**
   * Send command to machine with strict queuing and 5-second ACK timeout
   */
  public sendCommand(action: string, params: Record<string, unknown> = {}): Promise<UfAckPacket> {
    if (this.connectionState === 'demo' && this.demoDevice) {
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          resolve({ t: 'ack', a: action, ok: true });
        }, 100);
        // Temporary listener for demo ack
        const unsub = this.addPacketListener((pkt) => {
          if (pkt.t === 'ack' && (pkt.a === action || pkt.a === '?')) {
            clearTimeout(timeout);
            unsub();
            resolve(pkt);
          }
        });
        this.demoDevice?.handleCommand(action, params);
      });
    }

    if (this.connectionState !== 'connected' || !this.commandChar) {
      return Promise.reject(new Error('Chưa kết nối Bluetooth với máy'));
    }

    return new Promise<UfAckPacket>((resolve, reject) => {
      this.commandQueue.push({ action, params, resolve, reject });
      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.isProcessingCommand || this.commandQueue.length === 0) {
      return;
    }

    this.isProcessingCommand = true;
    const item = this.commandQueue.shift()!;

    try {
      const commandPayload = JSON.stringify({
        a: item.action,
        p: item.params && Object.keys(item.params).length > 0 ? item.params : undefined,
      }) + '\n';

      const encoder = new TextEncoder();
      const bytes = encoder.encode(commandPayload);

      if (bytes.length > 511) {
        throw new Error('Lệnh quá dài (> 511 bytes)');
      }

      // Prepare pending ACK listener with 5s timeout
      const timer = setTimeout(() => {
        if (this.pendingAck) {
          const timeoutAction = this.pendingAck.action;
          const rej = this.pendingAck.reject;
          this.pendingAck = null;
          this.isProcessingCommand = false;
          rej(new Error(`Máy không phản hồi lệnh "${timeoutAction}", thử lại`));
          this.processQueue();
        }
      }, 5000);

      this.pendingAck = {
        action: item.action,
        timer,
        resolve: item.resolve,
        reject: item.reject,
      };

      // Write to BLE GATT characteristic
      if (this.commandChar?.writeValueWithResponse) {
        await this.commandChar.writeValueWithResponse(bytes);
      } else if (this.commandChar?.writeValue) {
        await this.commandChar.writeValue(bytes);
      } else if (this.commandChar?.writeValueWithoutResponse) {
        await this.commandChar.writeValueWithoutResponse(bytes);
      } else {
        throw new Error('Không thể ghi lệnh vào Bluetooth characteristic');
      }
    } catch (err: unknown) {
      const error = err as Error;
      if (this.pendingAck) {
        clearTimeout(this.pendingAck.timer);
        this.pendingAck = null;
      }
      this.isProcessingCommand = false;
      item.reject(error);
      this.processQueue();
    }
  }

  private handleAckPacket(ack: UfAckPacket) {
    if (this.pendingAck && (this.pendingAck.action === ack.a || ack.a === '?')) {
      clearTimeout(this.pendingAck.timer);
      const { resolve } = this.pendingAck;
      this.pendingAck = null;
      this.isProcessingCommand = false;

      resolve(ack);

      // Toast feedback
      if (ack.ok) {
        if (ack.msg) {
          this.notifyToast('success', ack.msg);
        }
      } else {
        this.notifyToast('error', ack.msg || `Lỗi thực hiện lệnh ${ack.a}`);
      }

      this.processQueue();
    }
  }

  private failPendingCommand(err: Error) {
    if (this.pendingAck) {
      clearTimeout(this.pendingAck.timer);
      this.pendingAck.reject(err);
      this.pendingAck = null;
    }
    this.isProcessingCommand = false;
    while (this.commandQueue.length > 0) {
      const item = this.commandQueue.shift()!;
      item.reject(err);
    }
  }

  /**
   * Inject fault directly into Demo mode for testing
   */
  public demoInjectFault(code: number) {
    if (this.demoDevice) {
      this.demoDevice.injectFault(code);
    }
  }

  public demoClearFaults() {
    if (this.demoDevice) {
      this.demoDevice.clearAllFaults();
    }
  }
}
