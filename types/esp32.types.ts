export type ConnectionState = 'connected' | 'disconnected' | 'checking';

export interface ESP32Status {
  status: string;
  autoRunning: boolean;
  loopEnabled: boolean;
  holdTime: number;
  offTime: number;
}

export interface GPIOStatus {
  gp0: boolean; pin0: number;
  gp1: boolean; pin1: number;
  gp2: boolean; pin2: number;
  gp3: boolean; pin3: number;
  gp4: boolean; pin4: number;
}

export interface KeyboardStatus {
  key0: boolean; pin0: number;
  key1: boolean; pin1: number;
  key2: boolean; pin2: number;
  key3: boolean; pin3: number;
  key4: boolean; pin4: number;
  key5: boolean; pin5: number;
}

export interface SetArrayOptions {
  cycle?: boolean;
  holdTime?: number;
  offTime?: number;
}

export type Matrix = number[][];

export type Pattern = 
  | 'wave'
  | 'horizontal'
  | 'vertical'
  | 'diagonal'
  | 'spiral'
  | 'checkerboard'
  | 'raiseall'
  | 'lowerall'
  | 'testcorners';
