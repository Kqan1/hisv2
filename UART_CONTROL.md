# AMC-1 UART Control Interface

Complete offline command and control of the AMC-1 via serial UART. Mirrors all HTTP API functionality and WebSocket streams.

## Table of Contents

- [Overview](#overview)
- [Wiring](#wiring)
- [Protocol](#protocol)
- [Authentication](#authentication)
- [Command Reference](#command-reference)
- [Streaming Subscriptions](#streaming-subscriptions)
- [Examples](#examples)

---

## Overview

The AMC-1 exposes a dedicated UART control interface that provides:

- Full feature parity with the HTTP/WebSocket API
- Authentication via master password
- Toggleable real-time streams (keyboard, letters, status)
- JSON line-based protocol
- Works without WiFi or network access
- Separate from USB serial (debugging output stays on USB)

This is intended for embedded host integration (single-board computers, microcontrollers, industrial PLCs) where network access isn't available or desirable.

---

## Wiring

| AMC-1 Pin | Function | Connect To |
|-----------|----------|------------|
| GPIO15 | UART2 RX | Host TX |
| GPIO16 | UART2 TX | Host RX |
| GND | Ground | Host GND |

**Logic Level:** 3.3V (use a level shifter if your host is 5V)

### Configuration

| Parameter | Value |
|-----------|-------|
| Baud Rate | 115200 |
| Data Bits | 8 |
| Parity | None |
| Stop Bits | 1 |
| Flow Control | None |

---

## Protocol

### Format

- **JSON lines** - one JSON object per line
- **Line terminator** - newline (`\n`) or carriage return (`\r`)
- **Encoding** - UTF-8 / ASCII
- **Max command length** - 4096 bytes

### Request Structure

Every command must include an `action` field:

```json
{"action":"ping"}
```

Additional fields depend on the action (see [Command Reference](#command-reference)).

### Response Structure

All responses are JSON objects:

```json
{"success": true, "action": "ping", "pong": true, "uptime": 42}
```

On error:

```json
{"success": false, "error": "Invalid password"}
```

### Boot Banner

On startup, the device sends a hello message over the control UART:

```json
{"type":"hello","device":"AMC-1","firmware":"1.0","msg":"Send {\"action\":\"auth\",\"password\":\"...\"} to authenticate"}
```

Clients can use this as a "ready" signal after device boot or reset.

---

## Authentication

Most commands require authentication. Two commands are available without authentication:

- `ping` - check device responsiveness
- `info` - get device info and auth state

### Authenticate

```json
{"action":"auth","password":"7580"}
```

**Success response:**
```json
{"success":true,"action":"auth"}
```

**Failure response:**
```json
{"success":false,"error":"Invalid password"}
```

Authentication persists for the lifetime of the connection (until reboot). Sending an invalid `auth` command clears authentication.

---

## Command Reference

### Unauthenticated Commands

#### `ping`

Check device responsiveness.

**Request:**
```json
{"action":"ping"}
```

**Response:**
```json
{"success":true,"action":"ping","pong":true,"uptime":3672}
```

#### `info`

Get device identification.

**Request:**
```json
{"action":"info"}
```

**Response:**
```json
{
    "success":true,
    "action":"info",
    "device":"AMC-1",
    "firmware":"1.0",
    "rows":10,
    "cols":15,
    "authenticated":false
}
```

---

### Authenticated Commands

#### `status`

Get full system status.

**Request:**
```json
{"action":"status"}
```

**Response:**
```json
{
    "success":true,
    "action":"status",
    "loopEnabled":true,
    "latchingMode":false,
    "refreshInterval":50,
    "updateOnly":false,
    "updateOnlyDir":0,
    "fullRefreshOnUpdate":false,
    "refreshRunning":true,
    "wifiConnected":true,
    "ip":"192.168.1.100",
    "pixelOnTime":5000,
    "pixelOffTime":1000,
    "uptime":3672,
    "freeHeap":187432,
    "apiUser":"api_user",
    "ssid":"MyNetwork",
    "subscriptions":{"keys":false,"letters":false,"status":false}
}
```

---

#### `display`

Set the entire display buffer.

**Request:**
```json
{
    "action":"display",
    "pixels":[
        [0,1,-1,0,0,1,0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]
    ]
}
```

**Pixel values:** `1`=up, `-1`=down, `0`=off
**Array dimensions:** 10 rows × 15 columns

**Response:**
```json
{"success":true,"action":"display"}
```

---

#### `pixel`

Set a single pixel.

**Request:**
```json
{"action":"pixel","row":5,"col":7,"value":1}
```

**Response:**
```json
{"success":true,"action":"pixel","row":5,"col":7,"value":1}
```

---

#### `clear`

Clear all pixels.

**Request:**
```json
{"action":"clear"}
```

**Response:**
```json
{"success":true,"action":"clear"}
```

---

#### `loop`

Enable or disable continuous display refresh.

**Request:**
```json
{"action":"loop","enabled":true}
```

**Response:**
```json
{"success":true,"action":"loop","loopEnabled":true}
```

---

#### `stop`

Halt display refresh and disable outputs.

**Request:**
```json
{"action":"stop"}
```

**Response:**
```json
{"success":true,"action":"stop"}
```

---

#### `timing`

Update pixel timing.

**Request:**
```json
{"action":"timing","pixelOnTime":5000,"pixelOffTime":1000}
```

**Response:**
```json
{"success":true,"action":"timing","pixelOnTime":5000,"pixelOffTime":1000}
```

---

#### `latching`

Configure power-saving modes.

**Request:**
```json
{
    "action":"latching",
    "enabled":true,
    "refreshInterval":100,
    "updateOnly":false,
    "updateOnlyDir":0,
    "fullRefreshOnUpdate":false
}
```

All parameters are optional. `updateOnlyDir`: 0=both, 1=down only, 2=up only.

**Response:**
```json
{
    "success":true,
    "action":"latching",
    "latchingMode":true,
    "refreshInterval":100,
    "updateOnly":false,
    "updateOnlyDir":0,
    "fullRefreshOnUpdate":false
}
```

---

#### `credentials`

Update public API credentials.

**Request:**
```json
{"action":"credentials","apiUser":"newuser","apiPass":"newpass"}
```

**Response:**
```json
{"success":true,"action":"credentials"}
```

---

#### `wifi`

Update WiFi configuration. **Triggers device restart.**

**Request:**
```json
{"action":"wifi","ssid":"NetworkName","wifiPass":"NetworkPass"}
```

**Response (before restart):**
```json
{"success":true,"action":"wifi","note":"Device will restart in 1s"}
```

---

#### `audio`

Play an audio file via DFPlayer.

**Request:**
```json
{"action":"audio","folder":1,"file":1}
```

**Response:**
```json
{"success":true,"action":"audio","folder":1,"file":1}
```

---

#### `readout_ip`

Trigger audible IP address readout.

**Request:**
```json
{"action":"readout_ip"}
```

**Response:**
```json
{"success":true,"action":"readout_ip"}
```

---

## Streaming Subscriptions

Real-time events can be streamed to the host over UART. Subscriptions are **off by default** to avoid flooding the line at boot.

### Subscribe / Unsubscribe

**Request:**
```json
{"action":"subscribe","stream":"keys","enabled":true}
```

**Parameters:**
- `stream`: `keys`, `letters`, `status`, or `all`
- `enabled`: `true` to enable, `false` to disable

**Response:**
```json
{"success":true,"action":"subscribe","stream":"keys","enabled":true}
```

### Stream Types

#### Stream: `keys`

Every Braille keyboard state change. Mirrors WebSocket port 81.

```json
{"type":"keystate","keys":5,"spacebar":false,"dots":[1,0,1,0,0,0,0,0]}
```

#### Stream: `letters`

Decoded Braille letters when key combos are released. Mirrors WebSocket port 82.

```json
{"type":"letter","letter":"a","dots":1,"dotString":"1"}
```

#### Stream: `status`

System status updates. Mirrors WebSocket port 83.

```json
{"type":"status","event":"loop_changed","loopEnabled":true,...}
```

Includes heartbeat every 5 seconds.

#### Stream: `all`

Subscribes to all three streams at once.

```json
{"action":"subscribe","stream":"all","enabled":true}
```

---

## Identifying Message Types

The host can distinguish message types by their structure:

| Field | Meaning |
|-------|---------|
| Has `success` | Response to a command |
| `type == "hello"` | Boot banner |
| `type == "keystate"` | Key state stream |
| `type == "letter"` | Letter decode stream |
| `type == "status"` | Status update stream |

Streaming messages do **not** include a `success` field, making them easy to filter from command responses.

---

## Examples

### Python (with `pyserial`)

```python
import serial
import json
import time

class AMC1UART:
    def __init__(self, port, baud=115200, password="7580"):
        self.ser = serial.Serial(port, baud, timeout=1)
        time.sleep(2)  # Wait for boot
        self.ser.reset_input_buffer()
        self.send({"action": "auth", "password": password})
        resp = self.recv()
        if not resp.get("success"):
            raise Exception("Auth failed")
    
    def send(self, obj):
        line = json.dumps(obj) + "\n"
        self.ser.write(line.encode())
    
    def recv(self, timeout=2):
        deadline = time.time() + timeout
        while time.time() < deadline:
            line = self.ser.readline().decode().strip()
            if line:
                try:
                    return json.loads(line)
                except:
                    pass
        return None
    
    def cmd(self, action, **kwargs):
        self.send({"action": action, **kwargs})
        return self.recv()

# Usage
amc = AMC1UART("/dev/ttyUSB0")
print(amc.cmd("ping"))
amc.cmd("clear")
amc.cmd("pixel", row=5, col=7, value=1)
amc.cmd("loop", enabled=True)

# Subscribe to letter stream
amc.cmd("subscribe", stream="letters", enabled=True)

# Read incoming events
while True:
    msg = amc.recv(timeout=10)
    if msg and msg.get("type") == "letter":
        print(f"User typed: {msg['letter']}")
```

### Arduino / ESP32 (as host)

```cpp
#include <ArduinoJson.h>

#define AMC_RX 25  // Connect to AMC-1 TX (GPIO16)
#define AMC_TX 26  // Connect to AMC-1 RX (GPIO15)

HardwareSerial amcSerial(1);

void setup() {
    Serial.begin(115200);
    amcSerial.begin(115200, SERIAL_8N1, AMC_RX, AMC_TX);
    
    delay(3000);  // Wait for AMC-1 boot
    
    // Authenticate
    amcSerial.println("{\"action\":\"auth\",\"password\":\"7580\"}");
    
    // Subscribe to letters
    delay(100);
    amcSerial.println("{\"action\":\"subscribe\",\"stream\":\"letters\",\"enabled\":true}");
}

void loop() {
    if (amcSerial.available()) {
        String line = amcSerial.readStringUntil('\n');
        line.trim();
        
        StaticJsonDocument<256> doc;
        if (deserializeJson(doc, line) == DeserializationError::Ok) {
            const char* type = doc["type"];
            if (type && strcmp(type, "letter") == 0) {
                const char* letter = doc["letter"];
                Serial.printf("User typed: %s\n", letter);
            }
        }
    }
}
```

### Raspberry Pi (Bash + jq)

```bash
# Open serial port and authenticate
exec 3</dev/ttyUSB0
exec 4>/dev/ttyUSB0
stty -F /dev/ttyUSB0 115200 raw -echo

# Authenticate
echo '{"action":"auth","password":"7580"}' >&4
sleep 0.5

# Send a command
echo '{"action":"clear"}' >&4

# Subscribe to status
echo '{"action":"subscribe","stream":"status","enabled":true}' >&4

# Read responses and stream
while read -r line <&3; do
    echo "$line" | jq -c '.'
done
```

### PuTTY / Minicom (Manual Testing)

Connect at 115200 baud, 8N1, then type commands followed by Enter:

```
{"action":"ping"}
{"action":"auth","password":"7580"}
{"action":"status"}
{"action":"clear"}
{"action":"pixel","row":0,"col":0,"value":1}
{"action":"subscribe","stream":"letters","enabled":true}
```

---

## Error Codes

| Error Message | Meaning |
|---------------|---------|
| `Invalid JSON` | Could not parse the command as JSON |
| `Missing 'action' field` | Command JSON is missing the action key |
| `Not authenticated - send {"action":"auth","password":"..."}` | Authentication required for this command |
| `Invalid password` | Wrong master password |
| `Invalid coordinates` | Row/col out of range |
| `Unknown stream (use: keys, letters, status, all)` | Bad stream name in subscribe |
| `Unknown action` | Unrecognized action |
| `Command too long` | Buffer exceeded 4096 bytes (line never terminated) |

---

## Notes and Limitations

- **One UART, one client** - Unlike HTTP/WebSocket, only one host can use the UART at a time
- **Authentication is per-session** - Lost on device reboot, not on UART disconnect
- **Streams blocked by long commands** - Send commands and process streams in separate threads/tasks if doing both
- **No response ordering guarantee** - Stream messages may appear between command responses
- **Use `success` field to filter** - Command responses always have `success`; stream messages have `type` but never `success`
- **Persistence** - Configuration changes (`timing`, `latching`, `credentials`, `wifi`) are saved to flash
- **WiFi command reboots device** - Drain your serial buffer and reconnect after issuing `wifi`

---

## Compatibility

- Works with any host that supports a 3.3V UART at 115200 baud
- Tested with Linux `/dev/ttyUSB*`, Windows COM ports, microcontroller `HardwareSerial`
- JSON parser must handle messages up to 2KB (commands up to 4KB for `display`)
- Newlines in field values must be JSON-escaped (`\n`)
