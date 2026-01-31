# Electromagnet Matrix - WebSocket API

Real-time keyboard event streaming via WebSocket for the Electromagnet Matrix Controller.

## Connection

**WebSocket URL:** `ws://pixelmatrix.local:81`

```javascript
const ws = new WebSocket('ws://pixelmatrix.local:81');
```

## Message Types

### Server → Client Messages

#### 1. `keyboard` - Full Keyboard State

Sent automatically when you connect, or when you request it with `getKeyboards`.

```json
{
  "type": "keyboard",
  "ts": 123456,
  "kb1": {
    "raw": 63,
    "keys": [false, false, false, false, false, false]
  },
  "kb2": {
    "raw": 255,
    "keys": {
      "mt": false,
      "ca": false,
      "set": false,
      "volu": false,
      "vold": false
    }
  }
}
```

| Field | Description |
|-------|-------------|
| `ts` | Timestamp in milliseconds (since boot) |
| `kb1.raw` | Raw byte value of keyboard 1 GPIO state |
| `kb1.keys` | Array of 6 booleans, `true` = pressed |
| `kb2.raw` | Raw byte value of MCP23008 GPIO state |
| `kb2.keys` | Object with named keys, `true` = pressed |

---

#### 2. `keyChange` - Individual Key Event

Sent immediately when any key is pressed or released.

```json
{
  "type": "keyChange",
  "ts": 123456,
  "keyboard": 1,
  "key": 3,
  "keyName": "KEY3",
  "pressed": true
}
```

| Field | Description |
|-------|-------------|
| `ts` | Timestamp in milliseconds |
| `keyboard` | `1` = ESP32 GPIO keyboard, `2` = MCP23008 keyboard |
| `key` | Key index (0-5 for kb1, 0-4 for kb2) |
| `keyName` | Human-readable name (`KEY0`-`KEY5`, `MT`, `CA`, `SET`, `VOLU`, `VOLD`) |
| `pressed` | `true` = key pressed, `false` = key released |

---

#### 3. `pong` - Heartbeat Response

Sent in response to a `ping` message.

```json
{
  "type": "pong",
  "ts": 123456
}
```

---

### Client → Server Messages

| Message | Description |
|---------|-------------|
| `getKeyboards` | Request full keyboard state |
| `ping` | Heartbeat (server responds with `pong`) |

---

## Key Names Reference

### Keyboard 1 (ESP32 GPIO)

| Index | Name | GPIO Pin |
|-------|------|----------|
| 0 | `KEY0` | 10 |
| 1 | `KEY1` | 9 |
| 2 | `KEY2` | 21 |
| 3 | `KEY3` | 14 |
| 4 | `KEY4` | 13 |
| 5 | `KEY5` | 11 |

### Keyboard 2 (MCP23008 I2C)

| Index | Name | MCP23008 Pin | Function |
|-------|------|--------------|----------|
| 0 | `MT` | GP0 | Mute |
| 1 | `CA` | GP4 | Call |
| 2 | `SET` | GP3 | Settings |
| 3 | `VOLU` | GP2 | Volume Up |
| 4 | `VOLD` | GP1 | Volume Down |

---

## Examples

### JavaScript (Browser)

```javascript
let ws;

function connect() {
  ws = new WebSocket('ws://pixelmatrix.local:81');
  
  ws.onopen = () => {
    console.log('✓ Connected');
    ws.send('getKeyboards');
  };
  
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    
    switch (data.type) {
      case 'keyboard':
        console.log('Full state:', data);
        break;
        
      case 'keyChange':
        console.log(`${data.keyName} ${data.pressed ? 'PRESSED' : 'RELEASED'}`);
        
        // Handle specific keys
        if (data.pressed) {
          switch (data.keyName) {
            case 'VOLU':
              // Volume up pressed
              break;
            case 'VOLD':
              // Volume down pressed
              break;
            case 'MT':
              // Mute pressed
              break;
          }
        }
        break;
        
      case 'pong':
        console.log('Heartbeat OK');
        break;
    }
  };
  
  ws.onclose = () => {
    console.log('✗ Disconnected, reconnecting in 3s...');
    setTimeout(connect, 3000);
  };
  
  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
  };
}

// Keep connection alive
setInterval(() => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send('ping');
  }
}, 30000);

connect();
```

---

### JavaScript (Node.js)

```javascript
const WebSocket = require('ws');

const ws = new WebSocket('ws://pixelmatrix.local:81');

ws.on('open', () => {
  console.log('Connected');
  ws.send('getKeyboards');
});

ws.on('message', (data) => {
  const msg = JSON.parse(data);
  
  if (msg.type === 'keyChange') {
    console.log(`[${msg.keyboard}] ${msg.keyName}: ${msg.pressed ? 'DOWN' : 'UP'}`);
  }
});

ws.on('close', () => {
  console.log('Disconnected');
  process.exit(1);
});
```

---

### Python (asyncio)

```python
import asyncio
import websockets
import json

async def monitor():
    uri = "ws://pixelmatrix.local:81"
    
    async with websockets.connect(uri) as ws:
        # Get initial state
        await ws.send("getKeyboards")
        
        async for message in ws:
            data = json.loads(message)
            
            if data["type"] == "keyChange":
                action = "PRESSED" if data["pressed"] else "RELEASED"
                print(f"[KB{data['keyboard']}] {data['keyName']} {action}")
                
            elif data["type"] == "keyboard":
                print(f"Keyboard 1: {data['kb1']['keys']}")
                print(f"Keyboard 2: {data['kb2']['keys']}")

asyncio.run(monitor())
```

---

### Python (with reconnection)

```python
import asyncio
import websockets
import json

async def monitor():
    uri = "ws://pixelmatrix.local:81"
    
    while True:
        try:
            async with websockets.connect(uri) as ws:
                print("✓ Connected")
                await ws.send("getKeyboards")
                
                async for message in ws:
                    data = json.loads(message)
                    
                    if data["type"] == "keyChange":
                        action = "PRESSED" if data["pressed"] else "RELEASED"
                        print(f"{data['keyName']} {action}")
                        
        except websockets.exceptions.ConnectionClosed:
            print("✗ Disconnected, reconnecting in 3s...")
            await asyncio.sleep(3)
        except Exception as e:
            print(f"Error: {e}, reconnecting in 3s...")
            await asyncio.sleep(3)

asyncio.run(monitor())
```

---

### Python (callback-based with websocket-client)

```python
import websocket
import json
import threading

def on_message(ws, message):
    data = json.loads(message)
    
    if data["type"] == "keyChange":
        action = "PRESSED" if data["pressed"] else "RELEASED"
        print(f"{data['keyName']} {action}")

def on_open(ws):
    print("Connected")
    ws.send("getKeyboards")

def on_close(ws, close_status, close_msg):
    print("Disconnected")

def on_error(ws, error):
    print(f"Error: {error}")

ws = websocket.WebSocketApp(
    "ws://pixelmatrix.local:81",
    on_message=on_message,
    on_open=on_open,
    on_close=on_close,
    on_error=on_error
)

ws.run_forever(reconnect=3)  # Auto-reconnect every 3 seconds
```

---

### C# (.NET)

```csharp
using System;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

class Program
{
    static async Task Main()
    {
        using var ws = new ClientWebSocket();
        await ws.ConnectAsync(new Uri("ws://pixelmatrix.local:81"), CancellationToken.None);
        
        Console.WriteLine("Connected");
        
        // Request initial state
        var getKeyboards = Encoding.UTF8.GetBytes("getKeyboards");
        await ws.SendAsync(getKeyboards, WebSocketMessageType.Text, true, CancellationToken.None);
        
        var buffer = new byte[1024];
        
        while (ws.State == WebSocketState.Open)
        {
            var result = await ws.ReceiveAsync(buffer, CancellationToken.None);
            var message = Encoding.UTF8.GetString(buffer, 0, result.Count);
            var data = JsonDocument.Parse(message).RootElement;
            
            if (data.GetProperty("type").GetString() == "keyChange")
            {
                var keyName = data.GetProperty("keyName").GetString();
                var pressed = data.GetProperty("pressed").GetBoolean();
                Console.WriteLine($"{keyName} {(pressed ? "PRESSED" : "RELEASED")}");
            }
        }
    }
}
```

---

### Rust

```rust
use tungstenite::connect;
use serde_json::Value;

fn main() {
    let (mut socket, _) = connect("ws://pixelmatrix.local:81")
        .expect("Failed to connect");
    
    println!("Connected");
    
    socket.send("getKeyboards".into()).unwrap();
    
    loop {
        let msg = socket.read().expect("Failed to read");
        
        if let Ok(text) = msg.into_text() {
            let data: Value = serde_json::from_str(&text).unwrap();
            
            if data["type"] == "keyChange" {
                let key_name = data["keyName"].as_str().unwrap();
                let pressed = data["pressed"].as_bool().unwrap();
                println!("{} {}", key_name, if pressed { "PRESSED" } else { "RELEASED" });
            }
        }
    }
}
```

---

## Integration Patterns

### React Hook

```javascript
import { useState, useEffect, useCallback } from 'react';

function useKeyboardWebSocket(url = 'ws://pixelmatrix.local:81') {
  const [keyboards, setKeyboards] = useState({ kb1: null, kb2: null });
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState(null);

  useEffect(() => {
    let ws;
    let reconnectTimer;

    const connect = () => {
      ws = new WebSocket(url);

      ws.onopen = () => {
        setConnected(true);
        ws.send('getKeyboards');
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === 'keyboard') {
          setKeyboards({ kb1: data.kb1, kb2: data.kb2 });
        } else if (data.type === 'keyChange') {
          setLastEvent(data);
        }
      };

      ws.onclose = () => {
        setConnected(false);
        reconnectTimer = setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [url]);

  return { keyboards, connected, lastEvent };
}

// Usage
function App() {
  const { keyboards, connected, lastEvent } = useKeyboardWebSocket();

  useEffect(() => {
    if (lastEvent?.pressed) {
      console.log(`${lastEvent.keyName} pressed!`);
    }
  }, [lastEvent]);

  return (
    <div>
      <p>Status: {connected ? '🟢 Connected' : '🔴 Disconnected'}</p>
      <p>Last event: {lastEvent?.keyName} {lastEvent?.pressed ? 'DOWN' : 'UP'}</p>
    </div>
  );
}
```

---

### Event Emitter Pattern (Node.js)

```javascript
const WebSocket = require('ws');
const EventEmitter = require('events');

class KeyboardClient extends EventEmitter {
  constructor(url = 'ws://pixelmatrix.local:81') {
    super();
    this.url = url;
    this.ws = null;
    this.connect();
  }

  connect() {
    this.ws = new WebSocket(this.url);

    this.ws.on('open', () => {
      this.emit('connected');
      this.ws.send('getKeyboards');
    });

    this.ws.on('message', (data) => {
      const msg = JSON.parse(data);

      if (msg.type === 'keyChange') {
        this.emit('keyChange', msg);
        this.emit(msg.pressed ? 'keyDown' : 'keyUp', msg);
        this.emit(`key:${msg.keyName}`, msg.pressed);
      } else if (msg.type === 'keyboard') {
        this.emit('state', msg);
      }
    });

    this.ws.on('close', () => {
      this.emit('disconnected');
      setTimeout(() => this.connect(), 3000);
    });
  }

  getState() {
    this.ws?.send('getKeyboards');
  }
}

// Usage
const kb = new KeyboardClient();

kb.on('connected', () => console.log('Connected!'));
kb.on('keyDown', (e) => console.log(`${e.keyName} pressed`));
kb.on('keyUp', (e) => console.log(`${e.keyName} released`));

// Listen for specific key
kb.on('key:VOLU', (pressed) => {
  if (pressed) console.log('Volume Up!');
});
```

---

## Troubleshooting

### Cannot connect

1. **Check WiFi** - Ensure ESP32 is connected to the same network
2. **Check port** - WebSocket runs on port `81`, not `80`
3. **Try IP address** - Use `ws://192.168.x.x:81` instead of hostname

### Connection drops frequently

- Add heartbeat ping every 30 seconds:
  ```javascript
  setInterval(() => ws.send('ping'), 30000);
  ```

### Messages not receiving

- Check if WebSocket readyState is `OPEN` (1)
- Verify JSON parsing is working
- Check browser console for errors

### High latency

- Keyboard state is checked every 20ms on the ESP32
- Network latency adds ~1-10ms on local network
- Total response time should be <50ms

---

## Hardware Notes

- **Keyboard 1** uses ESP32 GPIO with internal pull-ups (active low)
- **Keyboard 2** uses MCP23008 I2C expander at address `0x24` with pull-ups enabled
- Both keyboards are **active low**: pressed = LOW, released = HIGH
- The WebSocket inverts this: `pressed: true` means the key is physically pressed

---

## Dependencies

### Arduino (ESP32)

Install via Library Manager:
- **WebSockets** by Markus Sattler (v2.x)

### Python

```bash
pip install websockets
# or
pip install websocket-client
```

### Node.js

```bash
npm install ws
```
