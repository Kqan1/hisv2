# AMC-1 Active Matrix Controller

ESP32-S3 firmware for controlling a 15x10 electromagnetic flip-dot style display using DRV8837 H-bridge drivers in an active matrix configuration.

## Table of Contents

- [Overview](#overview)
- [Hardware Architecture](#hardware-architecture)
- [Pin Assignments](#pin-assignments)
- [Shift Register Bit Mapping](#shift-register-bit-mapping)
- [Installation](#installation)
- [First-Time Setup](#first-time-setup)
- [Web Interface](#web-interface)
- [API Reference](#api-reference)
- [DFPlayer Audio](#dfplayer-audio)
- [Timing Configuration](#timing-configuration)
- [Troubleshooting](#troubleshooting)

---

## Overview

The AMC-1 is an active matrix controller for inductive/electromagnetic displays. Each pixel is driven by a DRV8837 H-bridge IC, allowing bidirectional current flow through electromagnetic coils. The display uses row scanning with 10 rows and 15 columns (150 total pixels).

### Features

- **15x10 pixel matrix** with bidirectional control (up/down/off states)
- **Web-based control interface** with password protection
- **REST API** for external application integration
- **Real-time row scanning** using FreeRTOS on dedicated core
- **Configurable timing** for pixel on/off durations
- **DFPlayer Mini integration** for audio feedback
- **WiFi connectivity** with AP fallback mode
- **Persistent configuration** stored in flash

---

## Hardware Architecture

### System Components

```
┌─────────────┐      ┌──────────────────┐      ┌─────────────────┐
│  ESP32-S3   │──────│  CD74HC4094 x6   │──────│  DRV8837 x150   │
│             │ SPI  │  Shift Registers │      │  H-Bridge ICs   │
└─────────────┘      └──────────────────┘      └─────────────────┘
       │                                              │
       │                                              │
       ▼                                              ▼
┌─────────────┐                               ┌─────────────────┐
│  DFPlayer   │                               │  Pixel Coils    │
│    Mini     │                               │   (10x15)       │
└─────────────┘                               └─────────────────┘
```

### DRV8837 H-Bridge Control

The DRV8837 uses a PWM/IN1-IN2 interface:

| IN1 | IN2 | OUT1 | OUT2 | Function |
|-----|-----|------|------|----------|
| 0   | 0   | Z    | Z    | Coast (Off) |
| 0   | 1   | L    | H    | Reverse (Down) |
| 1   | 0   | H    | L    | Forward (Up) |
| 1   | 1   | L    | L    | Brake |

The `nSLEEP` pin controls row activation - only one row is awake at a time during scanning.

---

## Pin Assignments

### Shift Register Interface

| Function | GPIO | Description |
|----------|------|-------------|
| DATA     | 42   | Serial data to shift registers |
| CLOCK    | 41   | Shift register clock |
| STROBE   | 40   | Latch signal to update outputs |
| OUTPUT_ENABLE | 48 | Enable shift register outputs (Active HIGH) |

### DFPlayer Mini

| Function | GPIO | Description |
|----------|------|-------------|
| TX       | 17   | ESP32 TX → DFPlayer RX |

> **Note:** DFPlayer requires 5V power supply. RX connection from DFPlayer to ESP32 is not used (TX-only configuration).

---

## Shift Register Bit Mapping

The system uses 48 bits across chained CD74HC4094 shift registers:

### Bits 0-29: Pixel Drivers (15 columns × 2 bits)

Each DRV8837 driver uses 2 consecutive bits:

| Bits | Column | IN1 (Even) | IN2 (Odd) |
|------|--------|------------|-----------|
| 0-1  | 0      | Bit 0      | Bit 1     |
| 2-3  | 1      | Bit 2      | Bit 3     |
| 4-5  | 2      | Bit 4      | Bit 5     |
| ...  | ...    | ...        | ...       |
| 28-29| 14     | Bit 28     | Bit 29    |

### Bits 30-39: Row nSLEEP Pins

| Bit | Row | Description |
|-----|-----|-------------|
| 30  | 0   | Row 0 wake signal |
| 31  | 1   | Row 1 wake signal |
| 32  | 2   | Row 2 wake signal |
| 33  | 3   | Row 3 wake signal |
| 34  | 4   | Row 4 wake signal |
| 35  | 5   | Row 5 wake signal |
| 36  | 6   | Row 6 wake signal |
| 37  | 7   | Row 7 wake signal |
| 38  | 8   | Row 8 wake signal |
| 39  | 9   | Row 9 wake signal |

### Bits 40-47: Special Functions

| Bit | Function |
|-----|----------|
| 40  | Mirror of bit 39 (Row 9) |
| 41  | Toggle each cycle |
| 42  | Always HIGH |
| 43-47 | Always LOW |

---

## Installation

### Using PlatformIO (Recommended)

1. Clone or download the firmware files
2. Open the project folder in PlatformIO
3. Build and upload:

```bash
cd amc1_controller
pio run -t upload
pio device monitor
```

### Using Arduino IDE

1. Install ESP32 board support:
   - Add `https://dl.espressif.com/dl/package_esp32_index.json` to Board Manager URLs
   - Install "esp32" by Espressif Systems

2. Board Settings:
   - Board: "ESP32S3 Dev Module"
   - USB CDC On Boot: "Enabled"
   - Upload Speed: 921600

3. Install required library:
   - ArduinoJson by Benoit Blanchon (v7.x)

4. Upload the sketch

---

## First-Time Setup

### Step 1: Power On

Connect USB or external power to the ESP32-S3. The device will start in AP mode if no WiFi is configured.

### Step 2: Connect to Setup Network

1. On your phone/computer, connect to WiFi network:
   - **SSID:** `AMC1-Setup`
   - **Password:** `amc1setup`

2. Open a web browser and navigate to:
   - **http://192.168.4.1**

### Step 3: Login

Enter the master password: **`7580`**

### Step 4: Configure WiFi

1. Scroll to "WiFi Configuration" section
2. Enter your network SSID and password
3. Click "Save & Reconnect"
4. Device will restart and connect to your network

### Step 5: Find Device IP

Check your router's DHCP client list, or monitor the Serial output to find the assigned IP address.

---

## Web Interface

Access the web interface at the device's IP address. All features require master password authentication.

### Master Password

Default: **`7580`**

### Interface Sections

#### Display Canvas (15x10)

Interactive pixel grid for drawing patterns:

- **Click** on a pixel to set it
- **Click and drag** to paint multiple pixels
- **Draw Modes:**
  - Up (Blue) - Forward polarity
  - Down (Red) - Reverse polarity
  - Off - No current

#### Canvas Controls

| Button | Function |
|--------|----------|
| Send to Display | Transmit current canvas to the matrix |
| Clear All | Set all pixels to off |
| Fill Up | Set all pixels to up state |
| Fill Down | Set all pixels to down state |
| Invert | Flip all pixel states |

#### Display Control

| Control | Function |
|---------|----------|
| Enable/Disable Loop | Toggle continuous display refresh |
| Stop Display | Halt refresh and disable outputs |
| Single Frame | Send one complete frame (no loop) |

The loop indicator shows:
- **Green (pulsing):** Loop running
- **Gray:** Loop stopped

#### Timing Settings

| Parameter | Description | Default |
|-----------|-------------|---------|
| Pixel On Time | Duration each row is energized (µs) | 5000 |
| Pixel Off Time | Delay between rows (µs) | 1000 |

#### Audio Test (DFPlayer)

| Button | Function |
|--------|----------|
| Play Folder 1 / File 1 | Plays `/01/001.mp3` |
| Play Folder 2 / File 1 | Plays `/02/001.mp3` |

#### API Configuration

Set credentials for external API access:
- API Username
- API Password

#### WiFi Configuration

- View current connection status
- Configure new network credentials

---

## API Reference

### Authentication

All API endpoints require authentication via JSON body:

**Master Access:**
```json
{
    "password": "7580"
}
```

**Public API Access:**
```json
{
    "user": "api_username",
    "pass": "api_password"
}
```

### Endpoints

#### POST `/api/verify`

Verify master password.

**Request:**
```json
{
    "password": "7580"
}
```

**Response:**
```json
{
    "success": true
}
```

---

#### POST `/api/status`

Get system status and configuration.

**Request:**
```json
{
    "password": "7580"
}
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
    "wifiConnected": true,
    "ip": "192.168.1.100",
    "display": [[0,1,-1,...], ...]
}
```

---

#### POST `/api/display`

Set the display buffer content.

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

**Pixel Values:**
- `1` = Up (Forward)
- `-1` = Down (Reverse)
- `0` = Off (Coast)

**Response:**
```json
{
    "success": true
}
```

---

#### POST `/api/loop`

Enable or disable the display refresh loop.

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

#### POST `/api/stop`

Stop the display refresh and disable outputs.

**Request:**
```json
{
    "password": "7580"
}
```

**Response:**
```json
{
    "success": true
}
```

---

#### POST `/api/frame`

Send a single frame without continuous loop.

**Request:**
```json
{
    "password": "7580",
    "pixels": [[...], ...]
}
```

**Response:**
```json
{
    "success": true
}
```

---

#### POST `/api/timing`

Update timing parameters.

**Request:**
```json
{
    "password": "7580",
    "pixelOnTime": 5000,
    "pixelOffTime": 1000
}
```

**Response:**
```json
{
    "success": true
}
```

---

#### POST `/api/credentials`

Update API credentials.

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
{
    "success": true
}
```

---

#### POST `/api/wifi`

Update WiFi configuration (triggers restart).

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
{
    "success": true
}
```

---

#### POST `/api/audio`

Play audio file via DFPlayer (Master only).

**Request:**
```json
{
    "password": "7580",
    "folder": 1,
    "file": 1
}
```

**Response:**
```json
{
    "success": true,
    "folder": 1,
    "file": 1
}
```

---

#### POST `/api/public`

Public API endpoint for external applications.

**Actions:**

**Display Frame:**
```json
{
    "user": "api_user",
    "pass": "api_pass",
    "action": "display",
    "pixels": [[...], ...]
}
```

**Set Single Pixel:**
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

**Clear Display:**
```json
{
    "user": "api_user",
    "pass": "api_pass",
    "action": "clear"
}
```

**Get Status:**
```json
{
    "user": "api_user",
    "pass": "api_pass",
    "action": "status"
}
```

---

## DFPlayer Audio

### SD Card Setup

Format a microSD card as FAT32 and create numbered folders:

```
/01/001.mp3
/01/002.mp3
/02/001.mp3
/02/002.mp3
```

**Folder naming:** Two digits (`01`, `02`, ... `99`)
**File naming:** Three digits (`001`, `002`, ... `255`)

### Hardware Connection

| DFPlayer Pin | Connection |
|--------------|------------|
| VCC          | 5V         |
| GND          | GND        |
| RX           | ESP32 GPIO17 |
| SPK1/SPK2    | Speaker    |

> **Important:** DFPlayer requires 5V power. The 3.3V from ESP32 is insufficient.

### Volume

Default volume is set to 20 (range 0-30) at startup.

---

## Timing Configuration

### Display Refresh Cycle

The display uses multiplexed row scanning:

```
For each row (0-9):
    1. Set pixel states for row (IN1/IN2 values)
    2. Wake row (set nSLEEP HIGH)
    3. Wait [Pixel On Time]
    4. Sleep row (set nSLEEP LOW)
    5. Wait [Pixel Off Time]
    6. Next row
```

### Timing Parameters

| Parameter | Description | Default | Range |
|-----------|-------------|---------|-------|
| Pixel On Time | Coil energize duration | 5000 µs | 100 - 100000 µs |
| Pixel Off Time | Inter-row delay | 1000 µs | 0 - 100000 µs |

### Calculating Frame Rate

```
Frame Time = 10 rows × (On Time + Off Time)
Frame Rate = 1,000,000 / Frame Time

Example (defaults):
Frame Time = 10 × (5000 + 1000) = 60,000 µs = 60 ms
Frame Rate = 1,000,000 / 60,000 = 16.7 FPS
```

### Tuning Guidelines

| Symptom | Adjustment |
|---------|------------|
| Weak pixel actuation | Increase Pixel On Time |
| Pixels not fully flipping | Increase Pixel On Time |
| Display flickering | Decrease Off Time |
| Overheating coils | Decrease On Time, ensure loop is not continuous |
| Slow refresh | Decrease both times |

---

## Troubleshooting

### WiFi Issues

**Device not connecting to WiFi:**
1. Device automatically falls back to AP mode
2. Connect to `AMC1-Setup` network
3. Reconfigure WiFi credentials

**Can't find device IP:**
- Check Serial monitor output
- Check router's DHCP client list
- Use `AMC1-Setup` AP mode to reconfigure

### Display Issues

**No pixel movement:**
1. Check OUTPUT_ENABLE signal (should be ~3.3V when active)
2. Verify shift register connections
3. Check power supply voltage and current capacity
4. Ensure loop is enabled

**OUTPUT_ENABLE voltage low (~2V instead of 3.3V):**
- Clean flux residue from PCB with isopropyl alcohol
- If persists, add 10K pull-up resistor from OE to 3.3V
- Or tie OE directly to 3.3V if dynamic control not needed

**Pixels responding incorrectly:**
1. Verify bit mapping matches PCB layout
2. Check IN1/IN2 polarity for coil orientation
3. Adjust timing parameters

**Only some rows working:**
1. Check nSLEEP connections for affected rows
2. Verify shift register chain continuity

### DFPlayer Issues

**No audio:**
1. Verify 5V power to DFPlayer
2. Check SD card format (FAT32)
3. Verify file naming (`/01/001.mp3`)
4. Check speaker connection

**Distorted audio:**
- Add 1K resistor in series with RX line
- Use separate power supply for DFPlayer

### Serial Debugging

Enable serial output at 115200 baud to view:
- WiFi connection status
- IP address assignment
- Error messages

```bash
# PlatformIO
pio device monitor

# Arduino IDE
Tools → Serial Monitor → 115200 baud
```

---

## Technical Specifications

| Parameter | Value |
|-----------|-------|
| MCU | ESP32-S3 |
| Display Size | 15 × 10 pixels |
| Pixel States | 3 (Up, Down, Off) |
| Shift Register Chain | 48 bits |
| Refresh Method | Row scanning |
| Max Frame Rate | ~50 FPS (timing dependent) |
| WiFi | 802.11 b/g/n |
| Web Interface | HTTP on port 80 |
| Flash Storage | NVS for configuration |

---

## License

MIT License - Free for personal and commercial use.

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2024 | Initial release |

