import { ESP32_CONFIG } from '@/lib/config';
import type {
  ConnectionState,
  ESP32Status,
  SetArrayOptions,
  Matrix
} from '@/types/esp32.types';

export type TransportMode = 'wifi' | 'uart';

class ESP32Service {
  private baseUrl: string;
  private useProxy: boolean;
  private ip: string;
  private state: ConnectionState = 'checking';
  private listeners = new Set<() => void>();
  private password = ESP32_CONFIG.password;
  private powerSaveEnabled = true;
  private lastSentMatrix: Matrix | null = null;

  // Transport mode
  private transport: TransportMode = 'wifi';

  // Status WebSocket (port 83) — WiFi mode
  private statusWs: WebSocket | null = null;
  private statusReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private lastStatus: ESP32Status | null = null;
  private statusListeners = new Set<(status: ESP32Status) => void>();
  private lastMessageTime = 0;
  private healthTimer: ReturnType<typeof setInterval> | null = null;
  private monitoring = false;

  // Keyboard WebSocket (port 81) — WiFi mode
  private keyWs: WebSocket | null = null;
  private keyReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private keyListeners = new Set<(msg: any) => void>();

  // Letter WebSocket (port 82) — WiFi mode (braille character output)
  private letterWs: WebSocket | null = null;
  private letterReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private letterListeners = new Set<(msg: any) => void>();

  // SSE connection — UART mode (replaces WebSockets)
  private sseSource: EventSource | null = null;
  private sseReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  // Polling fallback for connection state (SSE named events can be unreliable)
  private uartStatePoller: ReturnType<typeof setInterval> | null = null;

  // Shared nav-mode flag (set by useTabletNav, read by braille handlers)
  navActive = false;

  constructor(ip: string, useProxy = false) {
    this.ip = ip;
    this.useProxy = useProxy;
    this.baseUrl = useProxy 
      ? '/api/esp32'  // Next.js proxy
      : `http://${ip}`; // Direkt ESP32

    if (typeof window !== 'undefined') {
      const savedPowerSave = localStorage.getItem('esp32_power_save');
      if (savedPowerSave !== null) {
        this.powerSaveEnabled = savedPowerSave === 'true';
      }

      const savedIp = localStorage.getItem('esp32_ip');
      if (savedIp && !this.ip) {
        this.ip = savedIp;
      }

      // Load saved transport mode
      const savedTransport = localStorage.getItem('esp32_transport');
      if (savedTransport === 'uart' || savedTransport === 'wifi') {
        this.transport = savedTransport;
      }
    }

    // Default IP if still empty
    if (!this.ip) {
      this.ip = '192.168.10.79';
    }

    // Adjust baseUrl again in case IP changed
    this.baseUrl = useProxy 
      ? '/api/esp32'
      : `http://${this.ip}`;

    // Auto-start monitoring on client
    if (typeof window !== 'undefined') {
      if (this.transport === 'wifi') {
        this.startMonitoring();
        this.connectKeyboardWs();
        this.connectLetterWs();
        // Sync IP to server-side proxy
        this.syncIpToServer();
      } else {
        // UART mode: connect SSE stream
        this.connectSSE();
      }
    }
  }

  // ========================================================================
  // TRANSPORT MODE
  // ========================================================================

  setTransport(mode: TransportMode) {
    if (this.transport === mode) return;

    const oldMode = this.transport;
    this.transport = mode;

    if (typeof window !== 'undefined') {
      localStorage.setItem('esp32_transport', mode);
    }

    // Tear down old transport connections
    if (oldMode === 'wifi') {
      this.teardownWifiConnections();
    } else {
      this.teardownSSE();
    }

    // Set up new transport connections
    if (mode === 'wifi') {
      this.startMonitoring();
      this.connectKeyboardWs();
      this.connectLetterWs();
      this.syncIpToServer();
    } else {
      this.connectSSE();
    }
  }

  getTransport(): TransportMode {
    return this.transport;
  }

  private teardownWifiConnections() {
    // Stop status WS
    this.monitoring = false;
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
    if (this.statusReconnectTimer) {
      clearTimeout(this.statusReconnectTimer);
      this.statusReconnectTimer = null;
    }
    if (this.statusWs) {
      this.statusWs.close();
      this.statusWs = null;
    }
    // Stop keyboard WS
    if (this.keyReconnectTimer) {
      clearTimeout(this.keyReconnectTimer);
      this.keyReconnectTimer = null;
    }
    if (this.keyWs) {
      this.keyWs.close();
      this.keyWs = null;
    }
    // Stop letter WS
    if (this.letterReconnectTimer) {
      clearTimeout(this.letterReconnectTimer);
      this.letterReconnectTimer = null;
    }
    if (this.letterWs) {
      this.letterWs.close();
      this.letterWs = null;
    }
  }

  /** Push the current IP to the server-side proxy so /api/esp32/* routes use the right address */
  private syncIpToServer() {
    fetch('/api/esp32/ip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip: this.ip }),
    }).catch(() => {});
  }

  setIp(ip: string) {
    this.ip = ip;
    if (typeof window !== 'undefined') {
      localStorage.setItem('esp32_ip', ip);
      this.syncIpToServer();
    }
    if (!this.useProxy) {
      this.baseUrl = `http://${ip}`;
    }
    // Reconnect WebSocket to new IP (only in WiFi mode)
    if (this.transport === 'wifi' && this.monitoring) {
      this.forceReconnect();
    }
  }

  getIp(): string {
    return this.ip;
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
  // SSE CONNECTION — UART MODE (replaces WebSockets)
  // ========================================================================

  private connectSSE() {
    if (typeof window === 'undefined') return;
    if (this.sseSource) return;

    this.setState('checking');

    // Start polling /api/uart/connect for connection state as a reliable fallback
    this.startUartStatePolling();

    try {
      const source = new EventSource('/api/uart/stream?subscribe=all');

      source.onopen = () => {
        console.log('[ESP32] SSE connected');
        // Immediately poll for state on SSE open
        this.pollUartState();
      };

      source.addEventListener('state', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          if (data.state === 'connected') {
            this.setState('connected');
          } else if (data.state === 'disconnected') {
            this.setState('disconnected');
          } else {
            this.setState('checking');
          }
        } catch { /* ignore */ }
      });

      source.addEventListener('status', (e: MessageEvent) => {
        try {
          const status: ESP32Status = JSON.parse(e.data);
          this.lastStatus = status;
          this.setState('connected');
          this.statusListeners.forEach(fn => fn(status));
        } catch { /* ignore */ }
      });

      source.addEventListener('keystate', (e: MessageEvent) => {
        try {
          const msg = JSON.parse(e.data);
          this.keyListeners.forEach(fn => fn(msg));
        } catch { /* ignore */ }
      });

      source.addEventListener('letter', (e: MessageEvent) => {
        try {
          const msg = JSON.parse(e.data);
          this.letterListeners.forEach(fn => fn(msg));
        } catch { /* ignore */ }
      });

      source.onerror = () => {
        this.sseSource?.close();
        this.sseSource = null;
        this.setState('disconnected');
        // Auto-reconnect after 3 seconds
        this.sseReconnectTimer = setTimeout(() => {
          if (this.transport === 'uart') {
            this.connectSSE();
          }
        }, 3000);
      };

      this.sseSource = source;
    } catch {
      this.setState('disconnected');
      this.sseReconnectTimer = setTimeout(() => {
        if (this.transport === 'uart') {
          this.connectSSE();
        }
      }, 3000);
    }
  }

  private teardownSSE() {
    if (this.sseReconnectTimer) {
      clearTimeout(this.sseReconnectTimer);
      this.sseReconnectTimer = null;
    }
    if (this.sseSource) {
      this.sseSource.close();
      this.sseSource = null;
    }
    this.stopUartStatePolling();
  }

  /** Poll /api/uart/connect for connection state — reliable fallback for SSE */
  private startUartStatePolling() {
    if (this.uartStatePoller) return;
    this.pollUartState(); // Immediate first poll
    this.uartStatePoller = setInterval(() => this.pollUartState(), 5000);
  }

  private stopUartStatePolling() {
    if (this.uartStatePoller) {
      clearInterval(this.uartStatePoller);
      this.uartStatePoller = null;
    }
  }

  private async pollUartState() {
    try {
      const res = await fetch('/api/uart/connect', { cache: 'no-store' });
      const data = await res.json();
      if (data.state === 'connected') {
        this.setState('connected');
      } else if (data.state === 'disconnected') {
        this.setState('disconnected');
      }
    } catch { /* ignore */ }
  }

  /** Force reconnect SSE (e.g. after UART connect/disconnect) */
  reconnectSSE() {
    if (this.transport !== 'uart') return;
    this.teardownSSE();
    this.connectSSE();
  }

  // ========================================================================
  // STATUS WEBSOCKET (port 83) — WiFi mode only
  // ========================================================================

  /** Subscribe to real-time status updates from the device */
  onStatus(callback: (status: ESP32Status) => void) {
    this.statusListeners.add(callback);
    // Send last known status immediately if available
    if (this.lastStatus) {
      callback(this.lastStatus);
    }
    return () => this.statusListeners.delete(callback);
  }

  /** Get the last known status (may be null if never connected) */
  getLastStatus(): ESP32Status | null {
    return this.lastStatus;
  }

  private connectStatusWs() {
    if (typeof WebSocket === 'undefined') return; // SSR guard
    if (this.transport !== 'wifi') return; // Only in WiFi mode
    if (this.statusWs?.readyState === WebSocket.OPEN || 
        this.statusWs?.readyState === WebSocket.CONNECTING) return;

    try {
      const ws = new WebSocket(`ws://${this.ip}:83/`);

      ws.onopen = () => {
        this.setState('connected');
        this.lastMessageTime = Date.now();
      };

      ws.onmessage = (event) => {
        this.lastMessageTime = Date.now();
        try {
          const status: ESP32Status = JSON.parse(event.data);
          if (status.type === 'status') {
            this.lastStatus = status;
            this.setState('connected');
            this.statusListeners.forEach(fn => fn(status));
          }
        } catch { /* ignore malformed messages */ }
      };

      ws.onclose = () => {
        this.statusWs = null;
        if (this.monitoring && this.transport === 'wifi') {
          this.setState('disconnected');
          // Auto-reconnect after 2 seconds
          this.statusReconnectTimer = setTimeout(() => {
            this.connectStatusWs();
          }, 2000);
        }
      };

      ws.onerror = () => {
        // onclose will fire after this, handling reconnect
      };

      this.statusWs = ws;
    } catch {
      this.setState('disconnected');
      // Retry after 2 seconds
      this.statusReconnectTimer = setTimeout(() => {
        this.connectStatusWs();
      }, 2000);
    }
  }

  /** Start monitoring via status WebSocket — called once automatically in constructor */
  startMonitoring() {
    if (this.monitoring) return;
    if (this.transport !== 'wifi') return;
    this.monitoring = true;

    this.connectStatusWs();

    // Health check: if no message in 10s, connection is dead
    this.healthTimer = setInterval(() => {
      if (this.lastMessageTime > 0 && Date.now() - this.lastMessageTime > 10000) {
        this.setState('disconnected');
        this.statusWs?.close();
      }
    }, 3000);
  }

  /** Safe no-op — WebSocket stays alive for the app lifecycle. Hooks can call this without breaking anything. */
  stopMonitoring() {
    // Intentional no-op: WebSocket is managed at the service singleton level,
    // not per-component. Use forceReconnect() or setIp() to restart.
  }

  /** Force-disconnect and reconnect the status WebSocket (used by setIp) */
  private forceReconnect() {
    if (this.statusReconnectTimer) {
      clearTimeout(this.statusReconnectTimer);
      this.statusReconnectTimer = null;
    }
    if (this.statusWs) {
      this.statusWs.close();
      this.statusWs = null;
    }
    this.setState('checking');
    this.connectStatusWs();

    // Also reconnect keyboard WS to new IP
    if (this.keyReconnectTimer) {
      clearTimeout(this.keyReconnectTimer);
      this.keyReconnectTimer = null;
    }
    if (this.keyWs) {
      this.keyWs.close();
      this.keyWs = null;
    }
    this.connectKeyboardWs();
  }

  // ========================================================================
  // KEYBOARD WEBSOCKET (PORT 81) — WiFi mode only
  // ========================================================================

  /** Connect to the hardware keyboard WebSocket on port 81 */
  private connectKeyboardWs() {
    if (typeof window === 'undefined') return;
    if (this.transport !== 'wifi') return;
    if (this.keyWs) return;

    try {
      const ws = new WebSocket(`ws://${this.ip}:81/`);

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          for (const listener of this.keyListeners) {
            listener(msg);
          }
        } catch { /* ignore */ }
      };

      ws.onclose = () => {
        this.keyWs = null;
        if (this.transport === 'wifi') {
          this.keyReconnectTimer = setTimeout(() => {
            this.connectKeyboardWs();
          }, 3000);
        }
      };

      ws.onerror = () => { /* onclose will handle reconnect */ };

      this.keyWs = ws;
    } catch { /* ignore */ }
  }

  /** Subscribe to keyboard messages */
  onKeyMessage(listener: (msg: any) => void) {
    this.keyListeners.add(listener);
    return () => { this.keyListeners.delete(listener); };
  }

  /** Unsubscribe from keyboard messages */
  offKeyMessage(listener: (msg: any) => void) {
    this.keyListeners.delete(listener);
  }

  // ========================================================================
  // LETTER WEBSOCKET (PORT 82) — WiFi mode only
  // ========================================================================

  /** Connect to the braille letter WebSocket on port 82 */
  private connectLetterWs() {
    if (typeof window === 'undefined') return;
    if (this.transport !== 'wifi') return;
    if (this.letterWs) return;

    try {
      const ws = new WebSocket(`ws://${this.ip}:82/`);

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          for (const listener of this.letterListeners) {
            listener(msg);
          }
        } catch { /* ignore */ }
      };

      ws.onclose = () => {
        this.letterWs = null;
        if (this.transport === 'wifi') {
          this.letterReconnectTimer = setTimeout(() => {
            this.connectLetterWs();
          }, 3000);
        }
      };

      ws.onerror = () => { /* onclose will handle reconnect */ };

      this.letterWs = ws;
    } catch { /* ignore */ }
  }

  /** Subscribe to letter messages (braille character output) */
  onLetterMessage(listener: (msg: any) => void) {
    this.letterListeners.add(listener);
    return () => { this.letterListeners.delete(listener); };
  }

  /** Unsubscribe from letter messages */
  offLetterMessage(listener: (msg: any) => void) {
    this.letterListeners.delete(listener);
  }

  // ========================================================================
  // CORE REQUEST METHOD
  // ========================================================================

  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    try {
      // UART transport: proxy through /api/uart/command
      if (this.transport === 'uart') {
        return this.requestViaUart<T>(endpoint, options);
      }

      // WiFi transport: existing HTTP proxy path
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
        const contentType = response.headers.get('content-type');
        if (contentType?.includes('application/json')) {
          return response.json();
        }
        return response.text() as T;
      }

      throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      // Don't change connection state here — WebSocket/SSE is the source of truth
      throw error;
    }
  }

  /** Route a request through the UART command API */
  private async requestViaUart<T>(endpoint: string, options?: RequestInit): Promise<T> {
    let body: Record<string, unknown> = {};
    if (options?.body && typeof options.body === 'string') {
      try {
        body = JSON.parse(options.body);
      } catch { /* ignore */ }
    }

    const response = await fetch('/api/uart/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint,
        body,
      }),
      signal: AbortSignal.timeout(ESP32_CONFIG.timeout + 2000), // Extra time for serial
      cache: 'no-store',
    });

    if (response.ok) {
      // Successful command = we're connected
      this.setState('connected');
      return response.json();
    }

    const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    throw new Error(errorData.error || `HTTP ${response.status}`);
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
    if (typeof window !== 'undefined') {
      localStorage.setItem('esp32_power_save', String(enabled));
    }
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

  async setLatching(options: {
    enabled?: boolean;
    refreshInterval?: number;
    updateOnly?: boolean;
    updateOnlyDir?: number;
    fullRefreshOnUpdate?: boolean;
  }): Promise<any> {
    return this.request('/api/latching', {
      method: 'POST',
      body: JSON.stringify({
        password: this.password,
        ...options
      })
    });
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

  /** @deprecated Use onStatus() for live updates instead */
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
      ip || '',
      useProxy
    );
  }
  return esp32Instance;
}

// Export for direct access if needed
export { ESP32Service };
export type { TransportMode as ESP32TransportMode };