export type ConnectionState = 'connected' | 'disconnected' | 'checking';

export interface ESP32Status {
  success: boolean;
  pixelOnTime: number;
  pixelOffTime: number;
  apiUser: string;
  ssid: string;
  loopEnabled: boolean;
  wifiConnected: boolean;
  ip: string;
  display: number[][];
}

export interface SetArrayOptions {
  cycle?: boolean;
  holdTime?: number;
  offTime?: number;
}

export type Matrix = number[][];
