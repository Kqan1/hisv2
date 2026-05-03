import { ESP32_CONFIG } from '@/lib/config';
import type {
  ConnectionState,
  ESP32Status,
  SetArrayOptions,
  Matrix
} from '@/types/esp32.types';

class ESP32Service {
  private baseUrl: string;
  private useProxy: boolean;
  private state: ConnectionState = 'checking';
  private listeners = new Set<() => void>();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private password = ESP32_CONFIG.password;
  private powerSaveEnabled = true;
  private lastSentMatrix: Matrix | null = null;

  constructor(ip: string, useProxy = false) {
    this.useProxy = useProxy;
    this.baseUrl = useProxy 
      ? '/api/esp32'  // Next.js proxy
      : `http://${ip}`; // Direkt ESP32
  }

  // ========================================================================
  // STATE MANAGEMENT (for useSyncExternalStore)
  // ========================================================================

  subscribe(callback: () => void) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  getSnapshot = (): ConnectionState => this.state;

  getServerSnapshot = (): ConnectionState => 'checking';

  private setState(newState: ConnectionState) {
    if (this.state !== newState) {
      this.state = newState;
      this.listeners.forEach(fn => fn());
    }
  }

  // ========================================================================
  // HEALTH CHECK
  // ========================================================================

  private async healthCheck() {
    try {
      const response = await fetch(`${this.baseUrl}/api/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ password: this.password }),
        signal: AbortSignal.timeout(2000),
        cache: 'no-store'
      });
      this.setState(response.ok ? 'connected' : 'disconnected');
    } catch {
      this.setState('disconnected');
    }
  }

  startMonitoring() {
    if (this.healthCheckInterval) return;
    
    this.healthCheck();
    
    const scheduleNext = () => {
      const interval = ESP32_CONFIG.healthCheckInterval[this.state];
      this.healthCheckInterval = setTimeout(async () => {
        await this.healthCheck();
        scheduleNext();
      }, interval);
    };

    scheduleNext();
  }

  stopMonitoring() {
    if (this.healthCheckInterval) {
      clearTimeout(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  // ========================================================================
  // CORE REQUEST METHOD
  // ========================================================================

  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    try {
      const headersInit: HeadersInit = options?.headers || {};
      if (options?.body && typeof options.body === 'string') {
        const h = new Headers(headersInit);
        if (!h.has('Content-Type')) {
          h.set('Content-Type', 'application/json');
        }
        options = { ...options, headers: h };
      }
      
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        signal: AbortSignal.timeout(ESP32_CONFIG.timeout),
        cache: 'no-store'
      });

      if (response.ok) {
        this.setState('connected');
        const contentType = response.headers.get('content-type');
        if (contentType?.includes('application/json')) {
          return response.json();
        }
        return response.text() as T;
      }

      throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      this.setState('disconnected');
      throw error;
    }
  }

  // ========================================================================
  // API METHODS
  // ========================================================================

  async setPixel(row: number, col: number, raise: boolean): Promise<any> {
    const value = raise ? 1 : -1;
    return this.request('/api/public', {
      method: 'POST',
      body: JSON.stringify({
        user: ESP32_CONFIG.apiUser,
        pass: ESP32_CONFIG.apiPass,
        action: 'pixel',
        row,
        col,
        value
      })
    });
  }

  async setArray(array: Matrix, options: SetArrayOptions = {}): Promise<void> {
    // Fire-and-forget: send display data without blocking the UI
    const usePowerSave = options.powerSave ?? this.powerSaveEnabled;

    this.request('/api/display', {
      method: 'POST',
      body: JSON.stringify({
        password: this.password,
        pixels: array
      })
    }).catch(() => {}); // silently handle — connection state is updated by request()

    if (usePowerSave) {
      const isAllDown = array.every(row => row.every(cell => cell <= 0));
      if (isAllDown) {
        this.enableLoop(false);
      } else if (this.lastSentMatrix) {
        const wasAllDown = this.lastSentMatrix.every(row => row.every(cell => cell <= 0));
        if (wasAllDown) {
          this.enableLoop(true);
        }
      }
    }

    this.lastSentMatrix = array.map(row => [...row]);
  }

  setPowerSave(enabled: boolean) {
    this.powerSaveEnabled = enabled;
  }

  getPowerSave(): boolean {
    return this.powerSaveEnabled;
  }

  async setTiming(holdTime: number, offTime: number): Promise<any> {
    return this.request('/api/timing', {
      method: 'POST',
      body: JSON.stringify({
        password: this.password,
        pixelOnTime: holdTime,
        pixelOffTime: offTime
      })
    });
  }

  enableLoop(enabled: boolean): void {
    // Fire-and-forget: don't block on loop enable/disable
    this.request('/api/loop', {
      method: 'POST',
      body: JSON.stringify({
        password: this.password,
        enabled
      })
    }).catch(() => {});
  }

  async clear(): Promise<any> {
    return this.request('/api/public', {
      method: 'POST',
      body: JSON.stringify({
        user: ESP32_CONFIG.apiUser,
        pass: ESP32_CONFIG.apiPass,
        action: 'clear'
      })
    });
  }

  async stop(): Promise<any> {
    return this.request('/api/stop', {
      method: 'POST',
      body: JSON.stringify({
        password: this.password
      })
    });
  }

  async getStatus(): Promise<ESP32Status> {
    return this.request('/api/status', {
      method: 'POST',
      body: JSON.stringify({
        password: this.password
      })
    });
  }
}

// ========================================================================
// SINGLETON INSTANCE
// ========================================================================

let esp32Instance: ESP32Service | null = null;

export function getESP32Service(ip?: string, useProxy = true): ESP32Service {
  if (!esp32Instance) {
    esp32Instance = new ESP32Service(
      ip || ESP32_CONFIG.ip,
      useProxy
    );
  }
  return esp32Instance;
}

// Export for direct access if needed
export { ESP32Service };