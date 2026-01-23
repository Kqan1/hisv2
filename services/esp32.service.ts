import { ESP32_CONFIG } from '@/lib/config';
import type {
  ConnectionState,
  ESP32Status,
  GPIOStatus,
  KeyboardStatus,
  SetArrayOptions,
  Matrix,
  Pattern
} from '@/types/esp32.types';

class ESP32Service {
  private baseUrl: string;
  private useProxy: boolean;
  private state: ConnectionState = 'checking';
  private listeners = new Set<() => void>();
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor(ip: string, useProxy = false) {
    this.baseUrl = `http://${ip}`;
    this.baseUrl = useProxy 
      ? '/api/esp32'  // Next.js proxy
      : `http://${ip}`; // Direkt ESP32
    this.useProxy = useProxy;

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
        // ESP32 bazı kurulumlarda HEAD desteklemediği için 404 dönebiliyor.
        // GET ile sadece response.ok kontrolü yapıyoruz (body okumuyoruz).
        method: 'GET',
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

  async setPixel(row: number, col: number, raise: boolean): Promise<string> {
    const params = new URLSearchParams({
      row: row.toString(),
      col: col.toString(),
      raise: raise ? '1' : '0'
    });
    return this.request('/api/pixel', {
      method: 'POST',
      body: params
    });
  }

  async setArray(
    array: Matrix,
    options: SetArrayOptions = {}
  ): Promise<string> {
    const { cycle = false, holdTime = 100, offTime = 20 } = options;
    return this.request('/api/setarray', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ array, cycle, holdTime, offTime })
    });
  }

  async setTiming(holdTime: number, offTime: number): Promise<string> {
    const params = new URLSearchParams({
      holdTime: holdTime.toString(),
      offTime: offTime.toString()
    });
    return this.request('/api/timing', {
      method: 'POST',
      body: params
    });
  }

  async enableLoop(enabled: boolean): Promise<string> {
    const params = new URLSearchParams({
      enabled: enabled ? '1' : '0'
    });
    return this.request('/api/loop', {
      method: 'POST',
      body: params
    });
  }

  async runPattern(pattern: Pattern): Promise<string> {
    const params = new URLSearchParams({ pattern });
    return this.request('/api/pattern', {
      method: 'POST',
      body: params
    });
  }

  async clear(): Promise<string> {
    return this.request('/api/clear', { method: 'POST' });
  }

  async stop(): Promise<string> {
    return this.request('/api/stop', { method: 'POST' });
  }

  async getStatus(): Promise<ESP32Status> {
    return this.request('/api/status');
  }

  async getGPIO(): Promise<GPIOStatus> {
    return this.request('/api/gpio');
  }

  async getKeyboard(): Promise<KeyboardStatus> {
    return this.request('/api/keyboard');
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