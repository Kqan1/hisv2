/**
 * Server-side UART service for AMC-1 serial communication.
 *
 * This module manages a singleton serial connection to the AMC-1 device,
 * providing command/response matching and stream event emission.
 * It only runs on the server (Node.js) — browser code interacts via API routes.
 */

import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';
import { ESP32_CONFIG } from '@/lib/config';

// ========================================================================
// TYPES
// ========================================================================

export type UartConnectionState = 'connected' | 'disconnected' | 'connecting';

export interface UartPortInfo {
  path: string;
  manufacturer?: string;
  serialNumber?: string;
  vendorId?: string;
  productId?: string;
}

export interface UartStreamMessage {
  type: 'keystate' | 'letter' | 'status' | 'hello';
  [key: string]: unknown;
}

interface PendingCommand {
  resolve: (value: Record<string, unknown>) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

// ========================================================================
// UART SERVICE
// ========================================================================

class UartService {
  private port: SerialPort | null = null;
  private parser: ReadlineParser | null = null;
  private state: UartConnectionState = 'disconnected';
  private authenticated = false;
  private portPath: string = '';

  // Command queue — serial is half-duplex, so we send one command at a time
  // and match the next response with `success` field to the pending promise.
  private pendingCommand: PendingCommand | null = null;

  // Stream listeners
  private streamListeners = new Set<(msg: UartStreamMessage) => void>();

  // State change listeners (for SSE connections to know when state changes)
  private stateListeners = new Set<(state: UartConnectionState) => void>();

  // Active stream subscriptions on the device
  private activeSubscriptions = { keys: false, letters: false, status: false };

  // ========================================================================
  // CONNECTION
  // ========================================================================

  async connect(portPath: string, baudRate: number = 115200): Promise<{ device?: string; firmware?: string }> {
    if (this.state === 'connected' && this.portPath === portPath) {
      return { device: 'AMC-1' };
    }

    // Disconnect existing if switching ports
    if (this.port) {
      await this.disconnect();
    }

    this.state = 'connecting';
    this.portPath = portPath;
    this.notifyStateListeners();

    return new Promise((resolve, reject) => {
      try {
        const port = new SerialPort({
          path: portPath,
          baudRate,
          dataBits: 8,
          parity: 'none',
          stopBits: 1,
          autoOpen: false,
        });

        const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

        // Log raw data for diagnostics
        port.on('data', (data: Buffer) => {
          console.log('[UART] Raw RX:', data.toString('utf8').replace(/\r/g, '\\r').replace(/\n/g, '\\n'));
        });

        // Listen for incoming lines
        parser.on('data', (line: string) => {
          const trimmed = line.trim();
          console.log('[UART] Parsed line:', trimmed);
          this.handleLine(trimmed);
        });

        port.on('error', (err) => {
          console.error('[UART] Port error:', err.message);
          if (this.state === 'connecting') {
            this.state = 'disconnected';
            this.notifyStateListeners();
            reject(new Error(`Serial port error: ${err.message}`));
          }
        });

        port.on('close', () => {
          console.log('[UART] Port closed');
          this.state = 'disconnected';
          this.authenticated = false;
          this.activeSubscriptions = { keys: false, letters: false, status: false };
          this.notifyStateListeners();

          // Reject any pending command
          if (this.pendingCommand) {
            this.pendingCommand.reject(new Error('Port closed'));
            clearTimeout(this.pendingCommand.timer);
            this.pendingCommand = null;
          }
        });

        port.open(async (err) => {
          if (err) {
            this.state = 'disconnected';
            this.notifyStateListeners();
            reject(new Error(`Failed to open port: ${err.message}`));
            return;
          }

          console.log('[UART] Port opened:', portPath);
          this.port = port;
          this.parser = parser;

          // Some USB-serial adapters need DTR/RTS signals set to enable data flow
          try {
            port.set({ dtr: true, rts: true });
          } catch { /* ignore if not supported */ }

          // Wait for device to be ready (boot banner may arrive here)
          await this.sleep(1000);

          // Flush any stale data in the input buffer
          port.flush();

          try {
            console.log('[UART] Sending auth command...');
            const authResp = await this.sendCommand('auth', {
              password: ESP32_CONFIG.password,
            });

            console.log('[UART] Auth response:', JSON.stringify(authResp));

            if (authResp.success) {
              this.authenticated = true;
              this.state = 'connected';
              this.notifyStateListeners();
              resolve({
                device: (authResp.device as string) || 'AMC-1',
                firmware: (authResp.firmware as string) || 'unknown',
              });
            } else {
              await this.disconnect();
              reject(new Error((authResp.error as string) || 'Authentication failed'));
            }
          } catch (authErr) {
            console.error('[UART] Auth failed:', authErr);
            await this.disconnect();
            reject(authErr);
          }
        });
      } catch (err) {
        this.state = 'disconnected';
        this.notifyStateListeners();
        reject(err);
      }
    });
  }

  async disconnect(): Promise<void> {
    this.authenticated = false;
    this.activeSubscriptions = { keys: false, letters: false, status: false };

    if (this.pendingCommand) {
      this.pendingCommand.reject(new Error('Disconnecting'));
      clearTimeout(this.pendingCommand.timer);
      this.pendingCommand = null;
    }

    if (this.port?.isOpen) {
      return new Promise((resolve) => {
        this.port!.close(() => {
          this.port = null;
          this.parser = null;
          this.state = 'disconnected';
          this.notifyStateListeners();
          resolve();
        });
      });
    }

    this.port = null;
    this.parser = null;
    this.state = 'disconnected';
    this.notifyStateListeners();
  }

  getConnectionState(): UartConnectionState {
    return this.state;
  }

  getPortPath(): string {
    return this.portPath;
  }

  isAuthenticated(): boolean {
    return this.authenticated;
  }

  // ========================================================================
  // COMMAND / RESPONSE
  // ========================================================================

  /**
   * Send a command and wait for the response.
   * Commands are serialized — only one at a time.
   */
  async sendCommand(
    action: string,
    params: Record<string, unknown> = {},
    timeoutMs: number = 5000
  ): Promise<Record<string, unknown>> {
    if (!this.port?.isOpen) {
      throw new Error('UART not connected');
    }

    // Wait for any pending command to finish
    if (this.pendingCommand) {
      // Simple queue: wait up to timeout
      await new Promise<void>((resolve, reject) => {
        const start = Date.now();
        const check = () => {
          if (!this.pendingCommand) {
            resolve();
          } else if (Date.now() - start > timeoutMs) {
            reject(new Error('Command queue timeout'));
          } else {
            setTimeout(check, 50);
          }
        };
        check();
      });
    }

    const command = JSON.stringify({ action, ...params });
    console.log('[UART] TX:', command);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pendingCommand) {
          this.pendingCommand = null;
          reject(new Error(`Command timeout: ${action}`));
        }
      }, timeoutMs);

      this.pendingCommand = { resolve, reject, timer };

      this.port!.write(command + '\r\n', (err) => {
        if (err) {
          clearTimeout(timer);
          this.pendingCommand = null;
          reject(new Error(`Write error: ${err.message}`));
        } else {
          this.port!.drain(); // Ensure data is flushed to the device
        }
      });
    });
  }

  // ========================================================================
  // LINE HANDLING
  // ========================================================================

  private handleLine(line: string) {
    if (!line) return;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(line);
    } catch {
      console.warn('[UART] Non-JSON line:', line);
      return;
    }

    // Stream messages have `type` but no `success` field
    if ('type' in parsed && !('success' in parsed)) {
      const msg = parsed as unknown as UartStreamMessage;
      this.streamListeners.forEach((fn) => fn(msg));
      return;
    }

    // Command responses have `success` field
    if ('success' in parsed && this.pendingCommand) {
      const pending = this.pendingCommand;
      this.pendingCommand = null;
      clearTimeout(pending.timer);
      pending.resolve(parsed);
      return;
    }

    // Unmatched response (might be a late response or unexpected message)
    console.warn('[UART] Unmatched message:', parsed);
  }

  // ========================================================================
  // STREAM SUBSCRIPTIONS
  // ========================================================================

  /**
   * Subscribe to device stream events (keys, letters, status).
   * Sends subscribe command to device if not already subscribed.
   */
  async subscribeStream(stream: 'keys' | 'letters' | 'status' | 'all'): Promise<void> {
    if (!this.authenticated) throw new Error('Not authenticated');

    await this.sendCommand('subscribe', { stream, enabled: true });

    if (stream === 'all') {
      this.activeSubscriptions = { keys: true, letters: true, status: true };
    } else {
      this.activeSubscriptions[stream] = true;
    }
  }

  async unsubscribeStream(stream: 'keys' | 'letters' | 'status' | 'all'): Promise<void> {
    if (!this.authenticated) throw new Error('Not authenticated');

    await this.sendCommand('subscribe', { stream, enabled: false });

    if (stream === 'all') {
      this.activeSubscriptions = { keys: false, letters: false, status: false };
    } else {
      this.activeSubscriptions[stream] = false;
    }
  }

  /** Register a listener for stream messages. Returns unsubscribe function. */
  onStreamMessage(callback: (msg: UartStreamMessage) => void): () => void {
    this.streamListeners.add(callback);
    return () => this.streamListeners.delete(callback);
  }

  /** Register a listener for connection state changes. Returns unsubscribe function. */
  onStateChange(callback: (state: UartConnectionState) => void): () => void {
    this.stateListeners.add(callback);
    return () => this.stateListeners.delete(callback);
  }

  private notifyStateListeners() {
    this.stateListeners.forEach((fn) => fn(this.state));
  }

  // ========================================================================
  // PORT LISTING
  // ========================================================================

  async listPorts(): Promise<UartPortInfo[]> {
    const ports = await SerialPort.list();

    // On macOS, serial devices appear as both /dev/tty.* and /dev/cu.*
    // The tty.* variant requires carrier detect (DCD) and fails with "Resource busy".
    // The cu.* variant is correct for initiating connections.
    // Filter out tty.* when a matching cu.* exists.
    const cuPaths = new Set(
      ports.filter((p) => p.path.startsWith('/dev/cu.')).map((p) => p.path)
    );

    return ports
      .filter((p) => {
        // If this is a tty.* and a matching cu.* exists, skip it
        if (p.path.startsWith('/dev/tty.')) {
          const cuEquiv = p.path.replace('/dev/tty.', '/dev/cu.');
          if (cuPaths.has(cuEquiv)) return false;
        }
        return true;
      })
      .map((p) => ({
        path: p.path,
        manufacturer: p.manufacturer,
        serialNumber: p.serialNumber,
        vendorId: p.vendorId,
        productId: p.productId,
      }));
  }

  // ========================================================================
  // HELPERS
  // ========================================================================

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ========================================================================
// SINGLETON (survives Next.js HMR reloads via globalThis)
// ========================================================================

const globalForUart = globalThis as typeof globalThis & {
  __uartServiceInstance?: UartService;
};

export function getUartService(): UartService {
  if (!globalForUart.__uartServiceInstance) {
    globalForUart.__uartServiceInstance = new UartService();
  }
  return globalForUart.__uartServiceInstance;
}

export { UartService };
