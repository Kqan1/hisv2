# AMC-1 API Reference

Complete API documentation for the AMC-1 Active Matrix Controller firmware.

## Table of Contents

- [Overview](#overview)
- [Authentication](#authentication)
- [Connection](#connection)
- [Master API Endpoints](#master-api-endpoints)
- [Public API](#public-api)
- [WebSocket APIs](#websocket-apis)
- [Display Modes](#display-modes)
- [Code Examples](#code-examples)

---

## Overview

The AMC-1 exposes several API surfaces:

| Interface | Port | Purpose |
|-----------|------|---------|
| HTTP REST (Master) | 80 | Full configuration & control (password-protected) |
| HTTP REST (Public) | 80 | External app integration (username/password) |
| WebSocket (Keys) | 81 | Real-time keyboard state updates |
| WebSocket (Letters) | 82 | Decoded Braille letter notifications |

---

## Authentication

### Master Password

The master password (`7580` by default) grants full access to all endpoints. Required for configuration changes.

**Sent in JSON body:**
```json
{ "password": "7580" }
```

### Public API Credentials

User-defined username/password pair for external applications. Configurable via the master panel or `/api/credentials` endpoint.

**Default:** `api_user` / `api_pass`

**Sent in JSON body:**
```json
{ "user": "api_user", "pass": "api_pass" }
```

### Endpoints accepting both

The `/api/display`, `/api/frame`, `/api/latching`, and `/api/public` endpoints accept either authentication method.

---

## Connection

### Finding the Device IP

**AP Mode (no WiFi configured):**
- Connect to WiFi network `AMC1-Setup` (password: `amc1setup`)
- Device IP: `192.168.4.1`

**Station Mode (connected to WiFi):**
- Check Serial monitor at boot for assigned IP
- Or check your router's DHCP client list
- Or trigger IP audio readout: press F + J + Spacebar on the Braille keyboard

### Request Format

All API endpoints:
- **Method:** `POST`
- **Content-Type:** `application/json`
- **Body:** JSON object

### Response Format

All responses are JSON:
```json
{
    "success": true,
    "...additional fields..."
}
```

Errors:
```json
{
    "success": false,
    "error": "Error message"
}
```

---

## Master API Endpoints

### `POST /api/verify`

Verify the master password.

**Request:**
```json
{ "password": "7580" }
```

**Response:**
```json
{ "success": true }
```

---

### `POST /api/status`

Get system status and current configuration.

**Request:**
```json
{ "password": "7580" }
```

**Response:**
```json
{
    "success": true,
    "pixelOnTime": 5000,
    "pixelOffTime": 1000,
    "apiUser": "api_user",
    "ssid": "MyNetwork",
    "loopEnabled": false,
    "latchingMode": false,
    "refreshInterval": 50,
    "updateOnly": false,
    "updateOnlyDir": 0,
    "fullRefreshOnUpdate": false,
    "wifiConnected": true,
    "ip": "192.168.1.100",
    "display": [[0, 1, -1, ...], ...]
}
```

---

### `POST /api/display`

Set the entire display buffer.

**Authentication:** Master OR Public credentials

**Request:**
```json
{
    "password": "7580",
    "pixels": [
        [0, 1, -1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        ...
    ]
}
```

**Pixel values:**
- `1` = Up (forward polarity)
- `-1` = Down (reverse polarity)
- `0` = Off (coast)

**Array dimensions:** 10 rows × 15 columns

**Response:**
```json
{ "success": true }
```

---

### `POST /api/loop`

Enable or disable continuous display refresh.

**Request:**
```json
{
    "password": "7580",
    "enabled": true
}
```

**Response:**
```json
{
    "success": true,
    "loopEnabled": true
}
```

---

### `POST /api/stop`

Halt the refresh task and disable outputs.

**Request:**
```json
{ "password": "7580" }
```

**Response:**
```json
{ "success": true }
```

---

### `POST /api/frame`

Send a single frame without continuous loop.

**Authentication:** Master OR Public credentials

**Request:**
```json
{
    "password": "7580",
    "pixels": [[...], ...]
}
```

**Response:**
```json
{ "success": true }
```

---

### `POST /api/timing`

Update pixel timing parameters.

**Request:**
```json
{
    "password": "7580",
    "pixelOnTime": 5000,
    "pixelOffTime": 1000
}
```

**Parameters:**
- `pixelOnTime` (µs): How long each row is energized (100-100000)
- `pixelOffTime` (µs): Delay between rows (0-100000)

**Response:**
```json
{ "success": true }
```

---

### `POST /api/latching`

Configure power-saving display modes.

**Authentication:** Master OR Public credentials

**Request:**
```json
{
    "password": "7580",
    "enabled": true,
    "refreshInterval": 50,
    "updateOnly": false,
    "updateOnlyDir": 0,
    "fullRefreshOnUpdate": false
}
```

**Parameters:** (all optional - omit to leave unchanged)

| Parameter | Type | Description |
|-----------|------|-------------|
| `enabled` | bool | Enable latching mode (down pixels actuated every N cycles) |
| `refreshInterval` | int (1-10000) | Cycles between re-actuations in latching mode |
| `updateOnly` | bool | Only actuate pixels when their state changes |
| `updateOnlyDir` | int (0-2) | 0=both, 1=down only, 2=up only |
| `fullRefreshOnUpdate` | bool | Refresh all pixels when any pixel changes |

**Response:**
```json
{
    "success": true,
    "latchingMode": true,
    "refreshInterval": 50,
    "updateOnly": false,
    "updateOnlyDir": 0,
    "fullRefreshOnUpdate": false
}
```

See [Display Modes](#display-modes) for detailed behavior.

---

### `POST /api/credentials`

Update public API credentials.

**Request:**
```json
{
    "password": "7580",
    "apiUser": "new_username",
    "apiPass": "new_password"
}
```

**Response:**
```json
{ "success": true }
```

---

### `POST /api/wifi`

Update WiFi configuration. **Triggers device restart.**

**Request:**
```json
{
    "password": "7580",
    "ssid": "NetworkName",
    "wifiPass": "NetworkPassword"
}
```

**Response:**
```json
{ "success": true }
```

---

### `POST /api/audio`

Play an audio file via DFPlayer.

**Request:**
```json
{
    "password": "7580",
    "folder": 1,
    "file": 1
}
```

**Parameters:**
- `folder` (1-99): Folder number on SD card (e.g., `01`, `02`, `03`)
- `file` (1-255): File number within folder (e.g., `001.mp3`)

**Response:**
```json
{
    "success": true,
    "folder": 1,
    "file": 1
}
```

---

### `POST /api/readout-ip`

Trigger audible IP address readout via DFPlayer.

Plays files from folder `03` on SD card:
- `001.mp3` = "zero"
- `002.mp3` = "one"
- ... 
- `010.mp3` = "nine"
- `011.mp3` = "point"

**Request:**
```json
{ "password": "7580" }
```

**Response:**
```json
{ "success": true }
```

---

## Public API

### `POST /api/public`

Single endpoint for external applications. Action-based dispatch.

**Authentication:** Public credentials only

#### Action: `display`

Set the full display buffer.

```json
{
    "user": "api_user",
    "pass": "api_pass",
    "action": "display",
    "pixels": [[...], ...]
}
```

#### Action: `pixel`

Set a single pixel.

```json
{
    "user": "api_user",
    "pass": "api_pass",
    "action": "pixel",
    "row": 5,
    "col": 7,
    "value": 1
}
```

**Parameters:**
- `row` (0-9): Row index
- `col` (0-14): Column index
- `value` (-1, 0, 1): Pixel state

#### Action: `clear`

Clear all pixels (set to off).

```json
{
    "user": "api_user",
    "pass": "api_pass",
    "action": "clear"
}
```

#### Action: `status`

Get display state.

```json
{
    "user": "api_user",
    "pass": "api_pass",
    "action": "status"
}
```

**Response:**
```json
{
    "success": true,
    "loopEnabled": true,
    "refreshRunning": true,
    "latchingMode": false,
    "refreshInterval": 50,
    "updateOnly": false,
    "updateOnlyDir": 0,
    "fullRefreshOnUpdate": false
}
```

#### Action: `latching`

Configure power-saving modes (same parameters as `/api/latching`).

```json
{
    "user": "api_user",
    "pass": "api_pass",
    "action": "latching",
    "enabled": true,
    "refreshInterval": 100,
    "updateOnly": false,
    "updateOnlyDir": 1,
    "fullRefreshOnUpdate": false
}
```

---

## WebSocket APIs

### Keyboard State Stream (`ws://device-ip:81/`)

Broadcasts every key state change in real-time.

**No authentication required** (read-only stream).

**Message format:**
```json
{
    "type": "keystate",
    "keys": 5,
    "spacebar": false,
    "dots": [1, 0, 1, 0, 0, 0, 0, 0]
}
```

**Fields:**
- `keys`: Raw bitmask of pressed keys (bits 0-7 = GP0-GP7 of MCP23008)
- `spacebar`: Boolean - is spacebar currently pressed
- `dots`: Array of 8 values (0/1) for each key bit

**Hardware bit mapping:**
| Bit | Key | Braille Dot |
|-----|-----|-------------|
| 0 | A | 1 |
| 1 | S | 2 |
| 2 | D | 3 |
| 3 | F | 7 |
| 4 | J | 4 |
| 5 | K | 5 |
| 6 | L | 6 |
| 7 | ; | 8 |

---

### Letter Output Stream (`ws://device-ip:82/`)

Broadcasts decoded Braille letters when key combinations are released.

**Message format:**
```json
{
    "type": "letter",
    "letter": "a",
    "dots": 1,
    "dotString": "1"
}
```

**Fields:**
- `letter`: Single decoded character (lowercase a-z, punctuation, or `?` if unknown)
- `dots`: Bitmask in **logical dot order** (dot 1 = bit 0, dot 8 = bit 7)
- `dotString`: Human-readable comma-separated dot list (e.g., `"1,2,4"`)

**Special combos:**
- F + J + Spacebar → triggers IP audio readout (no letter sent)
- Spacebar alone → sends `letter: " "` with `dots: 0`

---

## Display Modes

The AMC-1 supports several power-saving modes that can be combined:

### Mode Priority

1. **Update-Only** takes precedence over Latching for affected directions
2. **Full Refresh on Update** triggers when any pixel changes (works with all modes)
3. **Latching** kicks in when Update-Only doesn't apply to a pixel

### Mode Combinations

| Latching | Update-Only | Direction | Behavior |
|----------|-------------|-----------|----------|
| OFF | OFF | - | Refresh every cycle (default) |
| ON | OFF | - | Down pixels every N cycles, up pixels every cycle |
| OFF | ON | Both | Only actuate on state change, no refresh |
| OFF | ON | Down only | Down on change only, up every cycle |
| OFF | ON | Up only | Up on change only, down every cycle |
| ON | ON | Down only | Up every cycle, down on change only |

### Use Cases

- **Bistable flip-dots:** Enable Latching with high refresh interval (200+) for max power saving
- **Mechanical drift:** Enable Latching with low interval (20-50) for occasional re-actuation
- **Truly latched mechanisms:** Enable Update-Only mode (Both directions) for zero idle power
- **Hybrid mechanisms:** Use Update-Only with Direction filter to target only the bistable polarity

---

## Code Examples

### Python

```python
import requests

class AMC1:
    def __init__(self, ip, user="api_user", password="api_pass"):
        self.base = f"http://{ip}"
        self.auth = {"user": user, "pass": password}
    
    def _post(self, endpoint, data):
        return requests.post(f"{self.base}{endpoint}", 
                             json={**self.auth, **data}).json()
    
    def display(self, pixels):
        """Send full 10x15 frame. pixels[row][col] = -1, 0, or 1"""
        return self._post("/api/public", {
            "action": "display",
            "pixels": pixels
        })
    
    def set_pixel(self, row, col, value):
        return self._post("/api/public", {
            "action": "pixel",
            "row": row, "col": col, "value": value
        })
    
    def clear(self):
        return self._post("/api/public", {"action": "clear"})
    
    def set_latching(self, enabled, interval=50):
        return self._post("/api/public", {
            "action": "latching",
            "enabled": enabled,
            "refreshInterval": interval
        })

# Usage
amc = AMC1("192.168.1.100")
amc.clear()

# Draw a checkerboard
pixels = [[1 if (r+c) % 2 == 0 else -1 for c in range(15)] for r in range(10)]
amc.display(pixels)

# Enable power saving
amc.set_latching(enabled=True, interval=100)
```

### JavaScript (Browser)

```javascript
const AMC1 = {
    base: 'http://192.168.1.100',
    auth: { user: 'api_user', pass: 'api_pass' },
    
    async post(endpoint, data) {
        const res = await fetch(this.base + endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...this.auth, ...data })
        });
        return res.json();
    },
    
    display(pixels) {
        return this.post('/api/public', { action: 'display', pixels });
    },
    
    setPixel(row, col, value) {
        return this.post('/api/public', { action: 'pixel', row, col, value });
    },
    
    clear() {
        return this.post('/api/public', { action: 'clear' });
    }
};

// Usage
await AMC1.clear();
await AMC1.setPixel(5, 7, 1);

// Subscribe to keyboard events
const ws = new WebSocket('ws://192.168.1.100:82/');
ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'letter') {
        console.log('Typed:', msg.letter);
    }
};
```

### curl

```bash
# Set a single pixel
curl -X POST http://192.168.1.100/api/public \
    -H "Content-Type: application/json" \
    -d '{"user":"api_user","pass":"api_pass","action":"pixel","row":3,"col":5,"value":1}'

# Clear display
curl -X POST http://192.168.1.100/api/public \
    -H "Content-Type: application/json" \
    -d '{"user":"api_user","pass":"api_pass","action":"clear"}'

# Get status (master)
curl -X POST http://192.168.1.100/api/status \
    -H "Content-Type: application/json" \
    -d '{"password":"7580"}'

# Enable latching mode (master)
curl -X POST http://192.168.1.100/api/latching \
    -H "Content-Type: application/json" \
    -d '{"password":"7580","enabled":true,"refreshInterval":100}'

# Play audio file
curl -X POST http://192.168.1.100/api/audio \
    -H "Content-Type: application/json" \
    -d '{"password":"7580","folder":1,"file":1}'
```

### Node.js (WebSocket)

```javascript
const WebSocket = require('ws');

const wsLetters = new WebSocket('ws://192.168.1.100:82/');
wsLetters.on('message', (data) => {
    const msg = JSON.parse(data);
    if (msg.type === 'letter') {
        process.stdout.write(msg.letter);
    }
});

const wsKeys = new WebSocket('ws://192.168.1.100:81/');
wsKeys.on('message', (data) => {
    const msg = JSON.parse(data);
    if (msg.type === 'keystate' && msg.keys !== 0) {
        console.log('\nKeys pressed:', msg.dots.map((v, i) => v ? i : null).filter(v => v !== null));
    }
});
```

---

## Error Codes

| HTTP Status | Meaning |
|-------------|---------|
| 200 | Request processed (check `success` field for result) |
| 404 | Endpoint not found |
| 405 | Wrong HTTP method (use POST) |

| Error Message | Cause |
|---------------|-------|
| `Unauthorized` | Wrong password / credentials |
| `Invalid coordinates` | Row/col out of range (0-9 / 0-14) |
| `Invalid password` | Master password mismatch |
| `Unknown action` | Unrecognized action in public API |

---

## Rate Limits

There are no built-in rate limits, but consider:

- The display refresh task runs at ~16 FPS by default
- API requests are processed between rows (every ~6ms during active refresh)
- Sending faster than the refresh rate will queue updates but only the latest state is displayed
- WebSocket broadcasts happen on every key state change (typically <100 events/sec)

For high-throughput updates, prefer the `display` action over multiple `pixel` calls.
