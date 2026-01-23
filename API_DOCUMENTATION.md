# Electromagnet Matrix Control - API Documentation

## Overview
This ESP32-based electromagnet matrix controller provides a comprehensive web interface and REST API for controlling a 10x15 pixel display using shift registers and H-bridge MOSFETs.

## Features
- ✅ Web-based UI with real-time control
- ✅ Drawing mode (raise/lower pixels with mouse/touch)
- ✅ IO Expander input visualization (5 GPIO inputs)
- ✅ 6-Key keyboard input display (active low)
- ✅ Configurable timing parameters
- ✅ REST API for programmatic control
- ✅ Array-based pixel control with cycle mode
- ✅ Multiple animation patterns

## Hardware Configuration

### Pin Assignments (Update in code before use)
```cpp
// Shift Register Control
SR_DATA = 42  (IO42)
SR_CLOCK = 41 (IO41)
SR_LATCH = 40 (IO40)
SR_OE = 39    (IO39)

// IO Expander GPIO Inputs (UPDATE THESE!)
GP0 = 36
GP1 = 37
GP2 = 38
GP3 = 45
GP4 = 46

// 6-Key Keyboard (Active Low) (UPDATE THESE!)
KEY0 = 10
KEY1 = 9
KEY2 = 21
KEY3 = 14
KEY4 = 13
KEY5 = 10  // Note: Pin 10 appears twice in spec
```

## REST API Endpoints

### 1. Set Individual Pixel
**Endpoint:** `POST /api/pixel`  
**Parameters:**
- `row` (0-9): Row index
- `col` (0-14): Column index
- `raise` (0 or 1): 0=lower, 1=raise

**Example:**
```bash
curl -X POST http://192.168.1.100/api/pixel \
  -d "row=5&col=7&raise=1"
```

**Response:** `Raised pixel (5,7)`

---

### 2. Set Pixel Array (Main API Feature)
**Endpoint:** `POST /api/setarray`  
**Content-Type:** `application/json`  
**Body Parameters:**
- `array` (required): 10x15 array of integers
  - `1` = raise pixel
  - `0` = lower pixel
  - `-1` = leave unchanged
- `cycle` (optional, default: false): 
  - `true` = continuously cycle/refresh the pattern
  - `false` = apply once
- `holdTime` (optional): Pixel activation time in ms (10-5000)
- `offTime` (optional): Delay between pixels in ms (0-1000)

**Example - Apply Once:**
```bash
curl -X POST http://192.168.1.100/api/setarray \
  -H "Content-Type: application/json" \
  -d '{
    "array": [
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
      [1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
      [1,0,1,1,1,1,1,1,1,1,1,1,1,0,1],
      [1,0,1,0,0,0,0,0,0,0,0,0,1,0,1],
      [1,0,1,0,1,1,1,1,1,1,1,0,1,0,1],
      [1,0,1,0,1,0,0,0,0,0,1,0,1,0,1],
      [1,0,1,0,1,1,1,1,1,1,1,0,1,0,1],
      [1,0,1,0,0,0,0,0,0,0,0,0,1,0,1],
      [1,0,1,1,1,1,1,1,1,1,1,1,1,0,1],
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]
    ],
    "cycle": false,
    "holdTime": 150,
    "offTime": 30
  }'
```

**Example - Continuous Cycle:**
```bash
curl -X POST http://192.168.1.100/api/setarray \
  -H "Content-Type: application/json" \
  -d '{
    "array": [
      [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1],
      [0,1,0,1,0,1,0,1,0,1,0,1,0,1,0],
      [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1],
      [0,1,0,1,0,1,0,1,0,1,0,1,0,1,0],
      [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1],
      [0,1,0,1,0,1,0,1,0,1,0,1,0,1,0],
      [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1],
      [0,1,0,1,0,1,0,1,0,1,0,1,0,1,0],
      [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1],
      [0,1,0,1,0,1,0,1,0,1,0,1,0,1,0]
    ],
    "cycle": true,
    "holdTime": 100,
    "offTime": 20
  }'
```

**Response:** `Array loaded. Mode: CYCLE, Hold: 100ms, Off: 20ms`

---

### 3. Configure Timing
**Endpoint:** `POST /api/timing`  
**Parameters:**
- `holdTime` (10-5000): Pixel activation time in milliseconds
- `offTime` (0-1000): Delay between pixel activations in milliseconds

**Example:**
```bash
curl -X POST http://192.168.1.100/api/timing \
  -d "holdTime=200&offTime=50"
```

**Response:** `Timing updated: Hold=200ms, Off=50ms`

---

### 4. Enable/Disable Loop
**Endpoint:** `POST /api/loop`  
**Parameters:**
- `enabled` (0 or 1): 0=disable, 1=enable

**Example:**
```bash
curl -X POST http://192.168.1.100/api/loop -d "enabled=1"
```

**Response:** `Loop enabled`

---

### 5. Run Pattern
**Endpoint:** `POST /api/pattern`  
**Parameters:**
- `pattern`: Pattern name

**Available Patterns:**
- `wave` - Diagonal wave animation
- `horizontal` - Horizontal sweep
- `vertical` - Vertical sweep
- `diagonal` - Diagonal animation
- `spiral` - Spiral from outside to inside
- `checkerboard` - Checkerboard pattern
- `raiseall` - Raise all pixels
- `lowerall` - Lower all pixels
- `testcorners` - Test corner pixels

**Example:**
```bash
curl -X POST http://192.168.1.100/api/pattern -d "pattern=spiral"
```

---

### 6. Clear All Pixels
**Endpoint:** `POST /api/clear`  

**Example:**
```bash
curl -X POST http://192.168.1.100/api/clear
```

**Response:** `All pixels cleared`

---

### 7. Stop Pattern
**Endpoint:** `POST /api/stop`  

**Example:**
```bash
curl -X POST http://192.168.1.100/api/stop
```

**Response:** `Stopped`

---

### 8. Get System Status
**Endpoint:** `GET /api/status`  

**Example:**
```bash
curl http://192.168.1.100/api/status
```

**Response:**
```json
{
  "status": "ok",
  "autoRunning": false,
  "loopEnabled": true,
  "holdTime": 100,
  "offTime": 20
}
```

---

### 9. Get GPIO Status
**Endpoint:** `GET /api/gpio`  

**Example:**
```bash
curl http://192.168.1.100/api/gpio
```

**Response:**
```json
{
  "gp0": true,
  "pin0": 36,
  "gp1": false,
  "pin1": 37,
  "gp2": true,
  "pin2": 38,
  "gp3": false,
  "pin3": 45,
  "gp4": true,
  "pin4": 46
}
```

---

### 10. Get Keyboard Status
**Endpoint:** `GET /api/keyboard`  

**Example:**
```bash
curl http://192.168.1.100/api/keyboard
```

**Response:**
```json
{
  "key0": true,
  "pin0": 10,
  "key1": true,
  "pin1": 9,
  "key2": false,
  "pin2": 21,
  "key3": true,
  "pin3": 14,
  "key4": true,
  "pin4": 13,
  "key5": true,
  "pin5": 10
}
```

**Note:** Active low - `false` means key is pressed, `true` means key is up

---

## Python Example Script

```python
import requests
import json
import time

# Configuration
ESP32_IP = "192.168.1.100"
BASE_URL = f"http://{ESP32_IP}"

def set_pixel(row, col, raise_pixel):
    """Set individual pixel"""
    data = {
        'row': row,
        'col': col,
        'raise': 1 if raise_pixel else 0
    }
    response = requests.post(f"{BASE_URL}/api/pixel", data=data)
    print(response.text)

def set_array(pixel_array, cycle=False, hold_time=100, off_time=20):
    """Set entire pixel array"""
    payload = {
        'array': pixel_array,
        'cycle': cycle,
        'holdTime': hold_time,
        'offTime': off_time
    }
    response = requests.post(
        f"{BASE_URL}/api/setarray",
        headers={'Content-Type': 'application/json'},
        data=json.dumps(payload)
    )
    print(response.text)

def set_timing(hold_time, off_time):
    """Configure timing parameters"""
    data = {
        'holdTime': hold_time,
        'offTime': off_time
    }
    response = requests.post(f"{BASE_URL}/api/timing", data=data)
    print(response.text)

def enable_loop(enable):
    """Enable or disable continuous loop"""
    data = {'enabled': 1 if enable else 0}
    response = requests.post(f"{BASE_URL}/api/loop", data=data)
    print(response.text)

def run_pattern(pattern_name):
    """Run a predefined pattern"""
    data = {'pattern': pattern_name}
    response = requests.post(f"{BASE_URL}/api/pattern", data=data)
    print(response.text)

def get_status():
    """Get current system status"""
    response = requests.get(f"{BASE_URL}/api/status")
    return response.json()

def get_gpio_status():
    """Get GPIO input states"""
    response = requests.get(f"{BASE_URL}/api/gpio")
    return response.json()

def get_keyboard_status():
    """Get keyboard key states"""
    response = requests.get(f"{BASE_URL}/api/keyboard")
    return response.json()

def clear_display():
    """Clear all pixels"""
    response = requests.post(f"{BASE_URL}/api/clear")
    print(response.text)

# Example Usage
if __name__ == "__main__":
    # Example 1: Set individual pixel
    print("Setting pixel (5, 7) to raised")
    set_pixel(5, 7, True)
    
    # Example 2: Create a border pattern
    print("\nCreating border pattern")
    border_array = [
        [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]
    ]
    set_array(border_array, cycle=True, hold_time=150, off_time=30)
    
    # Example 3: Enable loop
    print("\nEnabling continuous loop")
    enable_loop(True)
    
    time.sleep(5)
    
    # Example 4: Get status
    print("\nGetting system status")
    status = get_status()
    print(f"Status: {status}")
    
    # Example 5: Check GPIO inputs
    print("\nChecking GPIO inputs")
    gpio = get_gpio_status()
    for i in range(5):
        state = "HIGH" if gpio[f"gp{i}"] else "LOW"
        print(f"GP{i} (Pin {gpio[f'pin{i}']}): {state}")
    
    # Example 6: Check keyboard
    print("\nChecking keyboard")
    keyboard = get_keyboard_status()
    for i in range(6):
        # Active low - false means pressed
        state = "PRESSED" if not keyboard[f"key{i}"] else "UP"
        print(f"KEY{i} (Pin {keyboard[f'pin{i}']}): {state}")
    
    # Example 7: Run animation pattern
    print("\nRunning spiral pattern")
    run_pattern("spiral")
    
    time.sleep(3)
    
    # Example 8: Clear display
    print("\nClearing display")
    clear_display()
```

---

## Node.js Example Script

```javascript
const axios = require('axios');

// Configuration
const ESP32_IP = "192.168.1.100";
const BASE_URL = `http://${ESP32_IP}`;

async function setPixel(row, col, raise) {
    const data = new URLSearchParams({
        row: row,
        col: col,
        raise: raise ? 1 : 0
    });
    const response = await axios.post(`${BASE_URL}/api/pixel`, data);
    console.log(response.data);
}

async function setArray(pixelArray, cycle = false, holdTime = 100, offTime = 20) {
    const payload = {
        array: pixelArray,
        cycle: cycle,
        holdTime: holdTime,
        offTime: offTime
    };
    const response = await axios.post(`${BASE_URL}/api/setarray`, payload, {
        headers: { 'Content-Type': 'application/json' }
    });
    console.log(response.data);
}

async function setTiming(holdTime, offTime) {
    const data = new URLSearchParams({
        holdTime: holdTime,
        offTime: offTime
    });
    const response = await axios.post(`${BASE_URL}/api/timing`, data);
    console.log(response.data);
}

async function enableLoop(enable) {
    const data = new URLSearchParams({
        enabled: enable ? 1 : 0
    });
    const response = await axios.post(`${BASE_URL}/api/loop`, data);
    console.log(response.data);
}

async function runPattern(patternName) {
    const data = new URLSearchParams({
        pattern: patternName
    });
    const response = await axios.post(`${BASE_URL}/api/pattern`, data);
    console.log(response.data);
}

async function getStatus() {
    const response = await axios.get(`${BASE_URL}/api/status`);
    return response.data;
}

async function getGPIOStatus() {
    const response = await axios.get(`${BASE_URL}/api/gpio`);
    return response.data;
}

async function getKeyboardStatus() {
    const response = await axios.get(`${BASE_URL}/api/keyboard`);
    return response.data;
}

async function clearDisplay() {
    const response = await axios.post(`${BASE_URL}/api/clear`);
    console.log(response.data);
}

// Example Usage
async function main() {
    try {
        // Create checkerboard pattern
        console.log("Creating checkerboard pattern");
        const checkerboard = [];
        for (let row = 0; row < 10; row++) {
            const rowArray = [];
            for (let col = 0; col < 15; col++) {
                rowArray.push((row + col) % 2);
            }
            checkerboard.push(rowArray);
        }
        
        await setArray(checkerboard, true, 100, 20);
        await enableLoop(true);
        
        // Wait 5 seconds
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Get status
        const status = await getStatus();
        console.log("Status:", status);
        
        // Check inputs
        const gpio = await getGPIOStatus();
        console.log("GPIO Status:", gpio);
        
        const keyboard = await getKeyboardStatus();
        console.log("Keyboard Status:", keyboard);
        
    } catch (error) {
        console.error("Error:", error.message);
    }
}

main();
```

---

## Important Notes

1. **Pin Configuration**: Update the GPIO and keyboard pin assignments in the code before uploading to match your hardware

2. **Timing Parameters**:
   - `holdTime`: Time electromagnet stays active (10-5000ms)
   - `offTime`: Delay between pixels (0-1000ms)
   - Adjust these based on your electromagnet response time

3. **Cycle Mode**:
   - `cycle: false` - Pattern applied once then stops
   - `cycle: true` - Pattern continuously refreshed (loop must be enabled)

4. **Active Low Keyboard**: Keys read as `false` when pressed, `true` when released

5. **Network**: Ensure ESP32 and control device are on the same network

6. **ArduinoJson Library**: Install ArduinoJson library in Arduino IDE before compiling

---

## Installation Steps

1. Install Arduino IDE with ESP32 board support
2. Install ArduinoJson library (v6.x)
3. Update WiFi credentials in code
4. Update GPIO pin assignments
5. Upload to ESP32-S3
6. Open Serial Monitor (115200 baud) to see IP address
7. Open web browser to ESP32 IP address

---

## Troubleshooting

- **Can't connect to WiFi**: Check SSID and password
- **Pixels not responding**: Verify shift register wiring and bit assignments
- **Wrong orientation**: Use corner test and adjust flip flags
- **Timing issues**: Increase holdTime if electromagnets don't fully activate
- **API errors**: Check JSON format and array dimensions (must be 10x15)
