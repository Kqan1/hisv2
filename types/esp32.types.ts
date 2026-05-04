export type ConnectionState = 'connected' | 'disconnected' | 'checking';

export interface ESP32Status {
  type: string;
  event: string;
  loopEnabled: boolean;
  latchingMode: boolean;
  refreshInterval: number;
  updateOnly: boolean;
  updateOnlyDir: number;
  fullRefreshOnUpdate: boolean;
  refreshRunning: boolean;
  wifiConnected: boolean;
  ip: string;
  pixelOnTime: number;
  pixelOffTime: number;
  uptime: number;
  freeHeap: number;
  wifiRssi: number;
}

export interface SetArrayOptions {
  cycle?: boolean;
  holdTime?: number;
  offTime?: number;
  powerSave?: boolean;
}

export type Matrix = number[][];
