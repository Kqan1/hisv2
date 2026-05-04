# AMC-1 Status WebSocket

Real-time system status stream over WebSocket. Eliminates the need for HTTP polling.

## Connection

**URL:** `ws://<device-ip>:83/`

**Authentication:** None (read-only stream)

**Protocol:** WebSocket (RFC 6455), text frames, JSON payloads

---

## Behavior

- **On connect:** Server sends a complete status snapshot immediately
- **On state change:** Server broadcasts a status message to all connected clients
- **Heartbeat:** Server sends a status message every 5 seconds even if nothing changed
- **No client-to-server messages:** Any messages sent by clients are ignored

---

## Message Format

All messages are JSON objects with the following structure:

```json
{
    "type": "status",
    "event": "heartbeat",
    "loopEnabled": true,
    "latchingMode": false,
    "refreshInterval": 50,
    "updateOnly": false,
    "updateOnlyDir": 0,
    "fullRefreshOnUpdate": false,
    "refreshRunning": true,
    "wifiConnected": true,
    "ip": "192.168.1.100",
    "pixelOnTime": 5000,
    "pixelOffTime": 1000,
    "uptime": 3672,
    "freeHeap": 187432,
    "wifiRssi": -54
}
```

### Field Reference

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | Always `"status"` |
| `event` | string | What triggered this message (see [Event Types](#event-types)) |
| `loopEnabled` | bool | Whether continuous refresh is enabled |
| `latchingMode` | bool | Whether latching mode is active |
| `refreshInterval` | int | Cycles between re-actuations (latching mode) |
| `updateOnly` | bool | Whether update-only mode is active |
| `updateOnlyDir` | int | 0=both, 1=down only, 2=up only |
| `fullRefreshOnUpdate` | bool | Whether full refresh on update is enabled |
| `refreshRunning` | bool | Whether the display refresh task is currently running |
| `wifiConnected` | bool | Whether device is connected to WiFi (false = AP mode) |
| `ip` | string | Current IP address (Station IP or AP IP) |
| `pixelOnTime` | int | Pixel on time in microseconds |
| `pixelOffTime` | int | Pixel off time in microseconds |
| `uptime` | int | System uptime in seconds since boot |
| `freeHeap` | int | Free heap memory in bytes |
| `wifiRssi` | int | WiFi signal strength in dBm (0 if AP mode) |

---

## Event Types

The `event` field indicates what triggered the message:

| Event | When |
|-------|------|
| `connected` | Sent immediately when a client connects |
| `heartbeat` | Sent every 5 seconds |
| `loop_changed` | Loop was enabled/disabled |
| `display_stopped` | Display refresh was halted |
| `timing_changed` | Pixel timing parameters were updated |
| `latching_changed` | Any latching/update-only/full-refresh setting was modified |

Clients can ignore the `event` field if they only care about the current state - all status fields are present in every message.

---

## Use Cases

- **Connection monitoring** - Detect device offline/online without polling
- **Live dashboards** - Update UI immediately when settings change from another client
- **Multi-client sync** - All connected clients see configuration changes instantly
- **Health monitoring** - Track uptime, free heap, WiFi signal strength over time
- **Automation triggers** - React to display state changes in scripts

---

## Code Examples

### JavaScript (Browser)

```javascript
const ws = new WebSocket('ws://192.168.1.100:83/');

ws.onopen = () => {
    console.log('Connected to AMC-1');
    document.getElementById('status').textContent = 'Online';
};

ws.onmessage = (event) => {
    const status = JSON.parse(event.data);
    
    // Update UI fields
    document.getElementById('loop-state').textContent = 
        status.loopEnabled ? 'Running' : 'Stopped';
    document.getElementById('uptime').textContent = 
        Math.floor(status.uptime / 60) + ' minutes';
    document.getElementById('rssi').textContent = 
        status.wifiRssi + ' dBm';
    
    // Detect specific events
    if (status.event === 'loop_changed') {
        showNotification(`Loop ${status.loopEnabled ? 'enabled' : 'disabled'}`);
    }
};

ws.onclose = () => {
    document.getElementById('status').textContent = 'Offline';
    // Reconnect after 2 seconds
    setTimeout(() => location.reload(), 2000);
};

ws.onerror = (err) => {
    console.error('WebSocket error:', err);
};
```

### JavaScript with Auto-Reconnect

```javascript
class AMC1StatusClient {
    constructor(host, onStatus) {
        this.host = host;
        this.onStatus = onStatus;
        this.ws = null;
        this.connected = false;
        this.connect();
    }
    
    connect() {
        this.ws = new WebSocket(`ws://${this.host}:83/`);
        
        this.ws.onopen = () => {
            this.connected = true;
            this.onStatus({ event: 'online' });
        };
        
        this.ws.onmessage = (e) => {
            try {
                this.onStatus(JSON.parse(e.data));
            } catch (err) {
                console.error('Bad status message:', err);
            }
        };
        
        this.ws.onclose = () => {
            if (this.connected) {
                this.connected = false;
                this.onStatus({ event: 'offline' });
            }
            setTimeout(() => this.connect(), 2000);
        };
    }
}

// Usage
const client = new AMC1StatusClient('192.168.1.100', (status) => {
    if (status.event === 'offline') {
        console.log('Device went offline');
    } else if (status.event === 'online') {
        console.log('Device came online');
    } else {
        console.log('Status update:', status);
    }
});
```

### Python

```python
import json
import websocket

def on_message(ws, message):
    status = json.loads(message)
    print(f"[{status['event']}] Loop: {status['loopEnabled']}, "
          f"Uptime: {status['uptime']}s, "
          f"RSSI: {status['wifiRssi']} dBm")

def on_open(ws):
    print("Connected to AMC-1 status stream")

def on_close(ws, code, msg):
    print("Disconnected")

def on_error(ws, error):
    print(f"Error: {error}")

ws = websocket.WebSocketApp(
    "ws://192.168.1.100:83/",
    on_open=on_open,
    on_message=on_message,
    on_close=on_close,
    on_error=on_error
)
ws.run_forever()
```

### Python with Auto-Reconnect

```python
import json
import time
import websocket

def monitor_amc1(host):
    while True:
        try:
            ws = websocket.create_connection(f"ws://{host}:83/", timeout=10)
            print(f"Connected to {host}")
            
            while True:
                msg = ws.recv()
                status = json.loads(msg)
                
                if status['event'] == 'connected':
                    print("Initial state received")
                elif status['event'] == 'heartbeat':
                    print(f"Heartbeat - uptime {status['uptime']}s")
                else:
                    print(f"Event: {status['event']}")
                    
        except Exception as e:
            print(f"Connection lost: {e}")
            time.sleep(2)

monitor_amc1("192.168.1.100")
```

### Node.js

```javascript
const WebSocket = require('ws');

function connect(host) {
    const ws = new WebSocket(`ws://${host}:83/`);
    
    ws.on('open', () => console.log('Connected'));
    
    ws.on('message', (data) => {
        const status = JSON.parse(data);
        console.log(`[${status.event}] Free heap: ${status.freeHeap} bytes`);
    });
    
    ws.on('close', () => {
        console.log('Disconnected, reconnecting in 2s');
        setTimeout(() => connect(host), 2000);
    });
    
    ws.on('error', (err) => console.error(err.message));
}

connect('192.168.1.100');
```

### Bash (with `websocat`)

```bash
# Install websocat: https://github.com/vi/websocat

# Stream status to console
websocat ws://192.168.1.100:83/

# Stream and pretty-print with jq
websocat ws://192.168.1.100:83/ | jq '.'

# Filter only specific events
websocat ws://192.168.1.100:83/ | jq 'select(.event != "heartbeat")'
```

---

## Detecting Disconnection

The status WebSocket sends a heartbeat every 5 seconds. If your client doesn't receive any message within ~10 seconds, the connection is likely broken.

**Recommended client logic:**

```javascript
let lastMessageTime = Date.now();

ws.onmessage = (event) => {
    lastMessageTime = Date.now();
    // ... process message
};

// Check connection health every 3 seconds
setInterval(() => {
    if (Date.now() - lastMessageTime > 10000) {
        console.warn('No status messages for 10s - connection likely dead');
        ws.close();  // Triggers reconnect via onclose handler
    }
}, 3000);
```

---

## Differences from `/api/status`

| Feature | `/api/status` (HTTP) | `ws://...:83` (WebSocket) |
|---------|---------------------|---------------------------|
| Protocol | HTTP POST | WebSocket |
| Authentication | Required (master password) | None |
| Response model | Request/response | Push-based stream |
| Includes display buffer | Yes | No |
| Includes uptime/heap/RSSI | No | Yes |
| Latency | Polling delay | Instant (event-driven) |
| Use case | Initial load, full state | Live monitoring |

For most dashboard/monitoring use cases, prefer the WebSocket. Use HTTP `/api/status` only when you need the display buffer contents or want a one-shot snapshot.

---

## Compatibility

- **WebSocket version:** RFC 6455 (standard)
- **Tested clients:** Chrome, Firefox, Safari, Node.js `ws`, Python `websocket-client`
- **Multiple connections:** Supported (server broadcasts to all)
- **No subprotocols required**
- **No special headers required**
