/*
 * AMC-1 Active Matrix Controller
 * ESP32-S3 Firmware for DRV8837-based Inductive Matrix Display
 * 
 * Hardware Configuration:
 * - 10 rows x 15 columns = 150 pixels
 * - Each pixel driven by DRV8837DSGR H-bridge
 * - 48-bit shift register chain for control
 * - Row scanning with !SLEEP pin activation
 */

#include <WiFi.h>
#include <WebServer.h>
#include <Preferences.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <WebSocketsServer.h>
#include <SPI.h>

// ==================== PIN DEFINITIONS ====================
#define PIN_DATA          42  // SPI MOSI
#define PIN_CLOCK         41  // SPI SCK
#define PIN_STROBE        40  // Latch (manual control)
#define PIN_OUTPUT_ENABLE 48

// SPI Configuration for shift registers
#define SHIFT_REG_SPI_FREQ  8000000  // 8 MHz - safe for HC4094 at 3.3V

// DFPlayer Mini
#define PIN_DFP_TX        17  // ESP32 TX -> DFPlayer RX

// UART2 Control Interface (offline command/control)
#define PIN_UART_RX       15
#define PIN_UART_TX       16
#define UART_BAUD         115200

// I2C for MCP23008 (Braille Keyboard)
#define PIN_I2C_SDA       5
#define PIN_I2C_SCL       4

// Spacebar
#define PIN_SPACEBAR      21

// MCP23008 Configuration
// A0=HIGH, A1=LOW, A2=HIGH -> address bits = 101
// Base address 0x20 + (A2A1A0 = 0b101 = 5) = 0x25
#define MCP23008_ADDR     0x25

// MCP23008 Register Addresses
#define MCP_IODIR         0x00
#define MCP_IPOL          0x01
#define MCP_GPPU          0x06
#define MCP_GPIO          0x09
#define MCP_OLAT          0x0A

// Braille Key Mappings (MCP GPIO pin -> Braille dot)
// Based on keyboard layout: A=dot1, S=dot2, D=dot3, F=dot7
//                           J=dot4, K=dot5, L=dot6, ;=dot8
// We assume keys are wired to GP0-GP7 in this order:
// GP0=A(dot1), GP1=S(dot2), GP2=D(dot3), GP3=F(dot7)
// GP4=J(dot4), GP5=K(dot5), GP6=L(dot6), GP7=;(dot8)
#define KEY_A_DOT1        0
#define KEY_S_DOT2        1
#define KEY_D_DOT3        2
#define KEY_F_DOT7        3
#define KEY_J_DOT4        4
#define KEY_K_DOT5        5
#define KEY_L_DOT6        6
#define KEY_SEMI_DOT8     7

// ==================== MATRIX CONFIGURATION ====================
#define NUM_ROWS          10
#define NUM_COLS          15
#define BITS_PER_DRIVER   2
#define SHIFT_REG_BITS    48

// Row indices in shift register (for !SLEEP pins)
#define ROW_SLEEP_BIT_START 30

// ==================== TIMING DEFAULTS (microseconds) ====================
#define DEFAULT_PIXEL_ON_TIME_US   5000   // 5ms default on time
#define DEFAULT_PIXEL_OFF_TIME_US  1000   // 1ms default off time
#define DEFAULT_ROW_DWELL_US       10000  // 10ms per row

// ==================== CREDENTIALS ====================
#define MASTER_PASSWORD "7580"
#define DEFAULT_API_USER "api_user"
#define DEFAULT_API_PASS "api_pass"

// ==================== GLOBAL OBJECTS ====================
WebServer server(80);
WebSocketsServer wsKeys(81);    // WebSocket for key press notifications
WebSocketsServer wsLetters(82); // WebSocket for decoded letter output
WebSocketsServer wsStatus(83);  // WebSocket for system status updates
Preferences prefs;
HardwareSerial dfpSerial(1);  // Use UART1 for DFPlayer
HardwareSerial ctrlSerial(2); // Use UART2 for control interface
SPIClass shiftSPI(HSPI);      // Use HSPI for shift register output

// ==================== UART CONTROL STATE ====================
// Per-port state for the control interface
// Supports both USB Serial (Serial0) and UART2 (ctrlSerial)
struct UartPortState {
    bool authenticated;
    bool subKeys;
    bool subLetters;
    bool subStatus;
    String buffer;
};

UartPortState usbPortState  = { false, false, false, false, "" };  // USB Serial (Serial0)
UartPortState uart2PortState = { false, false, false, false, "" };  // UART2 (GPIO15/16)

// Pointer to whichever port is currently being replied to
// Using Print* because ESP32-S3 USB Serial is HWCDC, not HardwareSerial
Print* currentReplyPort = nullptr;
UartPortState*  currentReplyState = nullptr;

// Legacy aliases for auth check in processUartCommand
// (these point to whichever port is active during command processing)
#define uartAuthenticated (currentReplyState->authenticated)
#define uartSubKeys       (currentReplyState->subKeys)
#define uartSubLetters    (currentReplyState->subLetters)
#define uartSubStatus     (currentReplyState->subStatus)

// ==================== KEYBOARD STATE ====================
uint8_t currentKeyState = 0;       // Current state of MCP23008 keys (1=pressed)
uint8_t accumulatedDots = 0;       // Dots accumulated during current key press
bool spacebarState = false;        // Current spacebar state
bool spacebarLast = false;         // Previous spacebar state for edge detection
uint8_t lastKeyState = 0;          // Previous key state for edge detection
unsigned long lastKeyChangeTime = 0;
bool waitingForRelease = false;    // True when keys are pressed, waiting for all release
char lastDecodedChar = 0;          // Last decoded character

// ==================== FORWARD DECLARATIONS ====================
void dfpPlayFolder(uint8_t folder, uint8_t file);
void dfpSendCommand(uint8_t cmd, uint16_t param);
void dfpSetVolume(uint8_t volume);

// ==================== MATRIX STATE ====================
// Current display buffer: 0 = off, 1 = up, -1 = down
int8_t displayBuffer[NUM_ROWS][NUM_COLS] = {0};
// Target buffer for animations
int8_t targetBuffer[NUM_ROWS][NUM_COLS] = {0};
// Refresh age counter for each pixel (how many cycles since last actuation)
uint16_t pixelAge[NUM_ROWS][NUM_COLS] = {0};
// Pending update flags - true if pixel needs actuation due to state change
bool pixelNeedsUpdate[NUM_ROWS][NUM_COLS] = {false};
// Global flag: content has been updated, perform an update pass
volatile bool contentUpdated = false;

// ==================== CONFIGURATION ====================
struct Config {
    char ssid[33];
    char wifiPass[65];
    char apiUser[33];
    char apiPass[65];
    uint32_t pixelOnTime;     // microseconds
    uint32_t pixelOffTime;    // microseconds
    uint32_t rowDwellTime;    // microseconds
    bool loopEnabled;
    bool latchingMode;        // Enable bistable/latching pixel behavior
    uint16_t refreshInterval; // Refresh down pixels every N cycles (0 = always)
    bool updateOnlyMode;      // Only refresh on content update, no periodic refresh
    uint8_t updateOnlyDir;    // 0=both, 1=down only, 2=up only
    bool fullRefreshOnUpdate; // When new data arrives, refresh ALL pixels (not just changed)
} config;

// ==================== STATE VARIABLES ====================
volatile bool refreshRunning = false;
volatile bool stopRefresh = false;
TaskHandle_t displayTaskHandle = NULL;
bool wifiConnected = false;
bool apMode = false;

// ==================== SHIFT REGISTER FUNCTIONS ====================

void initShiftRegister() {
    // Strobe and Output Enable are manually controlled (not SPI peripheral)
    pinMode(PIN_STROBE, OUTPUT);
    pinMode(PIN_OUTPUT_ENABLE, OUTPUT);
    digitalWrite(PIN_STROBE, LOW);
    digitalWrite(PIN_OUTPUT_ENABLE, LOW);  // Disable outputs initially
    
    // Initialize hardware SPI on HSPI peripheral
    // Pin order: SCK, MISO, MOSI, SS
    // We don't use MISO or SS - pass -1
    shiftSPI.begin(PIN_CLOCK, -1, PIN_DATA, -1);
    
    Serial.printf("Shift register SPI initialized at %d Hz\n", SHIFT_REG_SPI_FREQ);
}

void shiftOut48Bits(uint8_t* data) {
    // Hardware SPI transfer - 6 bytes (48 bits) MSB first
    // SPI Mode 0: clock idle low, data sampled on rising edge
    // The 4094 strobe (latch) is separate - we toggle it after the SPI transfer
    
    shiftSPI.beginTransaction(SPISettings(SHIFT_REG_SPI_FREQ, MSBFIRST, SPI_MODE0));
    
    // Send bytes in reverse order so bit 47 goes out first (last in chain)
    // and bit 0 ends up at the first 4094's outputs
    for (int byteIdx = 5; byteIdx >= 0; byteIdx--) {
        shiftSPI.transfer(data[byteIdx]);
    }
    
    shiftSPI.endTransaction();
    
    // Strobe to latch data into output registers
    digitalWrite(PIN_STROBE, HIGH);
    delayMicroseconds(1);
    digitalWrite(PIN_STROBE, LOW);
}

void enableOutput(bool enable) {
    digitalWrite(PIN_OUTPUT_ENABLE, enable ? HIGH : LOW);
}

// ==================== MATRIX CONTROL ====================

void buildShiftRegisterData(uint8_t* data, int activeRow, int8_t* rowPixels) {
    // Clear all 48 bits (6 bytes)
    memset(data, 0, 6);
    
    // Bits 0-29: Pixel driver control (15 drivers x 2 bits each)
    // For DRV8837: IN1=bit0, IN2=bit1 for each pair
    // Forward (up): IN1=1, IN2=0
    // Reverse (down): IN1=0, IN2=1
    // Coast/Off: IN1=0, IN2=0
    
    for (int col = 0; col < NUM_COLS; col++) {
        int bitPos = col * BITS_PER_DRIVER;
        int byteIdx = bitPos / 8;
        int bitOffset = bitPos % 8;
        
        uint8_t in1 = 0, in2 = 0;
        
        if (rowPixels[col] > 0) {
            // Forward/Up: IN1=1, IN2=0
            in1 = 1;
            in2 = 0;
        } else if (rowPixels[col] < 0) {
            // Reverse/Down: IN1=0, IN2=1
            in1 = 0;
            in2 = 1;
        }
        // else: Coast/Off: IN1=0, IN2=0 (already set)
        
        // Set IN1 (even bit position)
        data[byteIdx] |= (in1 << bitOffset);
        
        // Set IN2 (odd bit position)
        if (bitOffset == 7) {
            data[byteIdx + 1] |= in2;
        } else {
            data[byteIdx] |= (in2 << (bitOffset + 1));
        }
    }
    
    // Bits 30-39: Row !SLEEP pins (active HIGH to wake row)
    // Only activate the current row
    if (activeRow >= 0 && activeRow < NUM_ROWS) {
        int bitPos = ROW_SLEEP_BIT_START + activeRow;
        int byteIdx = bitPos / 8;
        int bitOffset = bitPos % 8;
        data[byteIdx] |= (1 << bitOffset);
    }
    
    // Bit 40: Same as bit 39 (row 9's !SLEEP)
    if (activeRow == 9) {
        data[5] |= (1 << 0);  // Bit 40
    }
    
    // Bit 41: Toggle each cycle - handled externally
    static bool toggleBit = false;
    if (toggleBit) {
        data[5] |= (1 << 1);  // Bit 41
    }
    toggleBit = !toggleBit;
    
    // Bit 42: Always high
    data[5] |= (1 << 2);
    
    // Bits 43-47: Always low (already 0)
}

void allRowsOff() {
    uint8_t data[6] = {0};
    // Bit 42 always high
    data[5] |= (1 << 2);
    shiftOut48Bits(data);
}

// Set a pixel and reset its age (so it actuates on next refresh cycle)
void setPixel(int row, int col, int8_t value) {
    if (row < 0 || row >= NUM_ROWS || col < 0 || col >= NUM_COLS) return;
    int8_t newVal = constrain(value, -1, 1);
    if (displayBuffer[row][col] != newVal) {
        displayBuffer[row][col] = newVal;
        pixelAge[row][col] = 0;  // Force actuation on next cycle
        pixelNeedsUpdate[row][col] = true;
        contentUpdated = true;
    }
}

// Mark all pixels as needing update (used when fullRefreshOnUpdate is enabled)
void markAllForUpdate() {
    for (int row = 0; row < NUM_ROWS; row++) {
        for (int col = 0; col < NUM_COLS; col++) {
            pixelNeedsUpdate[row][col] = true;
            pixelAge[row][col] = 0;
        }
    }
    contentUpdated = true;
}

// Signal that content has been updated (call after batch updates)
void notifyContentUpdate() {
    if (config.fullRefreshOnUpdate) {
        markAllForUpdate();
    }
    contentUpdated = true;
}

// ==================== DISPLAY REFRESH TASK ====================

void displayRefreshTask(void* parameter) {
    uint8_t shiftData[6];
    int8_t rowPixels[NUM_COLS];
    
    while (true) {
        if (stopRefresh) {
            refreshRunning = false;
            allRowsOff();
            enableOutput(false);
            vTaskDelay(10 / portTICK_PERIOD_MS);
            continue;
        }
        
        // Update-only mode: skip refresh unless content has changed
        // (only skip if no directions are excluded from update-only mode)
        bool isUpdatePass = contentUpdated;
        bool affectsBoth = (config.updateOnlyDir == 0);
        if (config.updateOnlyMode && affectsBoth && !isUpdatePass) {
            // Both directions in update-only mode and no updates - sleep
            allRowsOff();
            enableOutput(false);
            vTaskDelay(20 / portTICK_PERIOD_MS);
            continue;
        }
        
        // Clear the update flag at the start of this refresh pass
        contentUpdated = false;
        
        refreshRunning = true;
        enableOutput(true);
        
        // Scan through all rows
        for (int row = 0; row < NUM_ROWS && !stopRefresh; row++) {
            // Build effective pixel states for this row, respecting all modes
            for (int col = 0; col < NUM_COLS; col++) {
                int8_t state = displayBuffer[row][col];
                bool needsUpdate = pixelNeedsUpdate[row][col];
                
                // Determine if this pixel's direction is in update-only mode
                // updateOnlyDir: 0=both, 1=down only, 2=up only
                bool inUpdateOnly = false;
                if (config.updateOnlyMode) {
                    if (config.updateOnlyDir == 0) inUpdateOnly = true;       // both
                    else if (config.updateOnlyDir == 1 && state == -1) inUpdateOnly = true;  // down only
                    else if (config.updateOnlyDir == 2 && state == 1) inUpdateOnly = true;   // up only
                }
                
                if (inUpdateOnly) {
                    // Only actuate if this pixel needs an update
                    if (needsUpdate) {
                        rowPixels[col] = state;
                        pixelNeedsUpdate[row][col] = false;
                    } else {
                        rowPixels[col] = 0;  // Coast
                    }
                } else if (config.latchingMode && state == -1) {
                    // Latching mode: down pixels only get pulled once every refreshInterval cycles
                    if (needsUpdate || pixelAge[row][col] == 0) {
                        rowPixels[col] = -1;
                        pixelAge[row][col] = config.refreshInterval;
                        pixelNeedsUpdate[row][col] = false;
                    } else {
                        rowPixels[col] = 0;
                        pixelAge[row][col]--;
                    }
                } else {
                    // Normal mode: actuate every cycle
                    rowPixels[col] = state;
                    if (state != 0) {
                        pixelAge[row][col] = 0;
                    }
                    pixelNeedsUpdate[row][col] = false;
                }
            }
            
            // Check if any pixels in this row need activation
            bool hasActivePixels = false;
            for (int col = 0; col < NUM_COLS; col++) {
                if (rowPixels[col] != 0) {
                    hasActivePixels = true;
                    break;
                }
            }
            
            if (hasActivePixels) {
                // Build and send shift register data with this row active
                buildShiftRegisterData(shiftData, row, rowPixels);
                shiftOut48Bits(shiftData);
                
                // Keep row active for pixel on time
                delayMicroseconds(config.pixelOnTime);
                
                // Turn off row
                allRowsOff();
                
                // Off time between rows
                delayMicroseconds(config.pixelOffTime);
            } else {
                // Skip empty rows but maintain timing
                delayMicroseconds(config.rowDwellTime / NUM_ROWS);
            }
            
            // Yield after each row to give web server / API requests a chance to process
            // Also re-check stop conditions and content updates mid-frame for responsiveness
            taskYIELD();
            
            // If new content arrived mid-frame, abort current frame to start fresh
            // (only if full refresh is enabled, otherwise just continue)
            if (contentUpdated && config.fullRefreshOnUpdate) {
                break;  // Restart frame from row 0
            }
        }
        
        // If loop is disabled, stop after one complete frame
        // BUT: in update-only mode (any direction), keep the task running to wait for updates
        if (!config.loopEnabled && !config.updateOnlyMode) {
            stopRefresh = true;
        }
        
        // Small yield to prevent watchdog issues
        vTaskDelay(1);
    }
}

void startDisplayRefresh() {
    stopRefresh = false;
    if (displayTaskHandle == NULL) {
        xTaskCreatePinnedToCore(
            displayRefreshTask,
            "DisplayRefresh",
            4096,
            NULL,
            2,  // Higher priority
            &displayTaskHandle,
            1   // Run on core 1
        );
    }
}

void stopDisplayRefresh() {
    stopRefresh = true;
    while (refreshRunning) {
        delay(1);
    }
}

// ==================== MCP23008 I2C FUNCTIONS ====================

bool mcpWriteRegister(uint8_t reg, uint8_t value) {
    Wire.beginTransmission(MCP23008_ADDR);
    Wire.write(reg);
    Wire.write(value);
    return (Wire.endTransmission() == 0);
}

uint8_t mcpReadRegister(uint8_t reg) {
    Wire.beginTransmission(MCP23008_ADDR);
    Wire.write(reg);
    Wire.endTransmission();
    
    Wire.requestFrom(MCP23008_ADDR, (uint8_t)1);
    if (Wire.available()) {
        return Wire.read();
    }
    return 0xFF;
}

void initMCP23008() {
    Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
    Wire.setClock(400000);  // 400kHz I2C
    
    delay(50);
    
    // Configure all 8 pins as inputs
    mcpWriteRegister(MCP_IODIR, 0xFF);
    
    // Enable pull-ups (although hardware has them, internal pull-ups add safety)
    mcpWriteRegister(MCP_GPPU, 0xFF);
    
    // Invert input polarity so that "pressed" = 1 (since hardware is active-low)
    mcpWriteRegister(MCP_IPOL, 0xFF);
    
    Serial.println("MCP23008 initialized");
}

uint8_t readKeyboard() {
    // Returns key state with bit set when key is pressed (after polarity inversion)
    return mcpReadRegister(MCP_GPIO);
}

// ==================== BRAILLE DECODER ====================
// Standard 8-dot Braille
// Dot positions (logical bit assignments for decoder):
//   Dot 1 = bit 0    Dot 4 = bit 3
//   Dot 2 = bit 1    Dot 5 = bit 4
//   Dot 3 = bit 2    Dot 6 = bit 5
//   Dot 7 = bit 6    Dot 8 = bit 7
//
// Hardware (MCP23008) bit layout differs from logical layout:
//   GP0 (bit 0) = A = dot 1
//   GP1 (bit 1) = S = dot 2
//   GP2 (bit 2) = D = dot 3
//   GP3 (bit 3) = F = dot 7   <- needs remap
//   GP4 (bit 4) = J = dot 4   <- needs remap
//   GP5 (bit 5) = K = dot 5
//   GP6 (bit 6) = L = dot 6
//   GP7 (bit 7) = ; = dot 8

// Remap raw MCP23008 GP bits to logical dot bits
uint8_t remapHardwareToDots(uint8_t hwBits) {
    uint8_t dots = 0;
    if (hwBits & (1 << 0)) dots |= (1 << 0);  // GP0 -> dot 1
    if (hwBits & (1 << 1)) dots |= (1 << 1);  // GP1 -> dot 2
    if (hwBits & (1 << 2)) dots |= (1 << 2);  // GP2 -> dot 3
    if (hwBits & (1 << 3)) dots |= (1 << 6);  // GP3 -> dot 7
    if (hwBits & (1 << 4)) dots |= (1 << 3);  // GP4 -> dot 4
    if (hwBits & (1 << 5)) dots |= (1 << 4);  // GP5 -> dot 5
    if (hwBits & (1 << 6)) dots |= (1 << 5);  // GP6 -> dot 6
    if (hwBits & (1 << 7)) dots |= (1 << 7);  // GP7 -> dot 8
    return dots;
}

char decodeBraille(uint8_t dots) {
    // Use only dots 1-6 for standard letter mapping (mask out dots 7, 8)
    uint8_t pattern = dots & 0x3F;
    
    switch (pattern) {
        // Letters a-z (standard English Braille)
        case 0x01: return 'a'; // dot 1
        case 0x03: return 'b'; // dots 1,2
        case 0x09: return 'c'; // dots 1,4
        case 0x19: return 'd'; // dots 1,4,5
        case 0x11: return 'e'; // dots 1,5
        case 0x0B: return 'f'; // dots 1,2,4
        case 0x1B: return 'g'; // dots 1,2,4,5
        case 0x13: return 'h'; // dots 1,2,5
        case 0x0A: return 'i'; // dots 2,4
        case 0x1A: return 'j'; // dots 2,4,5
        case 0x05: return 'k'; // dots 1,3
        case 0x07: return 'l'; // dots 1,2,3
        case 0x0D: return 'm'; // dots 1,3,4
        case 0x1D: return 'n'; // dots 1,3,4,5
        case 0x15: return 'o'; // dots 1,3,5
        case 0x0F: return 'p'; // dots 1,2,3,4
        case 0x1F: return 'q'; // dots 1,2,3,4,5
        case 0x17: return 'r'; // dots 1,2,3,5
        case 0x0E: return 's'; // dots 2,3,4
        case 0x1E: return 't'; // dots 2,3,4,5
        case 0x25: return 'u'; // dots 1,3,6
        case 0x27: return 'v'; // dots 1,2,3,6
        case 0x3A: return 'w'; // dots 2,4,5,6
        case 0x2D: return 'x'; // dots 1,3,4,6
        case 0x3D: return 'y'; // dots 1,3,4,5,6
        case 0x35: return 'z'; // dots 1,3,5,6
        // Common punctuation
        case 0x02: return ','; // dot 2
        case 0x06: return ';'; // dots 2,3
        case 0x12: return ':'; // dots 2,5
        case 0x32: return '.'; // dots 2,5,6
        case 0x16: return '?'; // dots 2,3,6 (also '!')
        case 0x00: return ' '; // no dots = space
        default: return '?';
    }
}

// ==================== IP READOUT ====================
bool ipReadoutPlaying = false;
unsigned long ipReadoutNextTime = 0;
int ipReadoutIndex = 0;
char ipReadoutString[20] = {0};

void startIpReadout() {
    String ip;
    if (wifiConnected) {
        ip = WiFi.localIP().toString();
    } else {
        ip = WiFi.softAPIP().toString();
    }
    
    strncpy(ipReadoutString, ip.c_str(), 19);
    ipReadoutString[19] = 0;
    
    ipReadoutPlaying = true;
    ipReadoutIndex = 0;
    ipReadoutNextTime = millis();
    
    Serial.print("Starting IP readout: ");
    Serial.println(ipReadoutString);
}

void updateIpReadout() {
    if (!ipReadoutPlaying) return;
    if (millis() < ipReadoutNextTime) return;
    
    if (ipReadoutString[ipReadoutIndex] == 0) {
        // End of IP string
        ipReadoutPlaying = false;
        return;
    }
    
    char c = ipReadoutString[ipReadoutIndex];
    
    if (c >= '0' && c <= '9') {
        // Play digit: file 001 = "zero", 002 = "one", ..., 010 = "nine"
        uint8_t fileNum = (c - '0') + 1;  // 0 -> 1, 1 -> 2, ..., 9 -> 10
        dfpPlayFolder(3, fileNum);
        ipReadoutNextTime = millis() + 800;  // ~800ms per digit
    } else if (c == '.') {
        // Play "point" (file 011)
        dfpPlayFolder(3, 11);
        ipReadoutNextTime = millis() + 700;
    } else {
        ipReadoutNextTime = millis() + 100;
    }
    
    ipReadoutIndex++;
}

// ==================== STATUS BROADCAST ====================

void wsBroadcastStatus(const char* event = nullptr) {
    StaticJsonDocument<512> doc;
    doc["type"] = "status";
    if (event) doc["event"] = event;
    
    doc["loopEnabled"] = config.loopEnabled;
    doc["latchingMode"] = config.latchingMode;
    doc["refreshInterval"] = config.refreshInterval;
    doc["updateOnly"] = config.updateOnlyMode;
    doc["updateOnlyDir"] = config.updateOnlyDir;
    doc["fullRefreshOnUpdate"] = config.fullRefreshOnUpdate;
    doc["refreshRunning"] = refreshRunning;
    doc["wifiConnected"] = wifiConnected;
    doc["ip"] = wifiConnected ? WiFi.localIP().toString() : WiFi.softAPIP().toString();
    doc["pixelOnTime"] = config.pixelOnTime;
    doc["pixelOffTime"] = config.pixelOffTime;
    doc["uptime"] = millis() / 1000;
    doc["freeHeap"] = ESP.getFreeHeap();
    doc["wifiRssi"] = wifiConnected ? WiFi.RSSI() : 0;
    
    String output;
    serializeJson(doc, output);
    wsStatus.broadcastTXT(output);
    
    // Also send to UART ports if subscribed
    if (uart2PortState.subStatus) {
        ctrlSerial.println(output);
    }
    if (usbPortState.subStatus) {
        Serial.println(output);
    }
}

// ==================== KEYBOARD SCANNING ====================

void wsBroadcastKeyState(uint8_t keys, bool spacebar) {
    StaticJsonDocument<256> doc;
    doc["type"] = "keystate";
    doc["keys"] = keys;
    doc["spacebar"] = spacebar;
    
    JsonArray dotArray = doc.createNestedArray("dots");
    for (int i = 0; i < 8; i++) {
        dotArray.add((keys >> i) & 0x01 ? 1 : 0);
    }
    
    String output;
    serializeJson(doc, output);
    wsKeys.broadcastTXT(output);
    
    // Mirror to UART ports if subscribed
    if (uart2PortState.subKeys) {
        ctrlSerial.println(output);
    }
    if (usbPortState.subKeys) {
        Serial.println(output);
    }
}

void wsBroadcastLetter(char letter, uint8_t dots) {
    StaticJsonDocument<256> doc;
    doc["type"] = "letter";
    doc["letter"] = String(letter);
    doc["dots"] = dots;
    
    // Build dot string like "1,2,4"
    String dotStr = "";
    for (int i = 0; i < 8; i++) {
        if ((dots >> i) & 0x01) {
            if (dotStr.length() > 0) dotStr += ",";
            dotStr += String(i + 1);
        }
    }
    doc["dotString"] = dotStr;
    
    String output;
    serializeJson(doc, output);
    wsLetters.broadcastTXT(output);
    
    // Mirror to UART ports if subscribed
    if (uart2PortState.subLetters) {
        ctrlSerial.println(output);
    }
    if (usbPortState.subLetters) {
        Serial.println(output);
    }
}

void scanKeyboard() {
    // Read MCP23008 (returns inverted - bit set when pressed)
    uint8_t newKeyState = readKeyboard();
    bool newSpacebar = (digitalRead(PIN_SPACEBAR) == LOW);  // Active low
    
    // Detect any change
    bool stateChanged = (newKeyState != lastKeyState) || (newSpacebar != spacebarLast);
    
    if (stateChanged) {
        // Broadcast key state change immediately for debugging
        wsBroadcastKeyState(newKeyState, newSpacebar);
    }
    
    // Accumulate dots while keys are being pressed (remap hardware bits to logical dot bits)
    if (newKeyState != 0) {
        accumulatedDots |= remapHardwareToDots(newKeyState);
        waitingForRelease = true;
    }
    
    // When all keys released and we had keys pressed, decode the letter
    if (waitingForRelease && newKeyState == 0 && lastKeyState != 0) {
        // Check special combo: GP3 (dot7/F) + GP4 (dot4/J) + spacebar -> IP readout
        // Note: accumulatedDots is already in logical dot bit layout
        bool isIpReadoutCombo = ((accumulatedDots & (1 << 6)) != 0) &&  // dot 7
                                ((accumulatedDots & (1 << 3)) != 0) &&  // dot 4
                                spacebarLast;
        
        if (isIpReadoutCombo) {
            Serial.println("IP readout combo detected!");
            startIpReadout();
        } else {
            // Decode normal Braille letter
            char letter = decodeBraille(accumulatedDots);
            lastDecodedChar = letter;
            
            Serial.printf("Braille decoded: dots=0x%02X letter='%c'\n", accumulatedDots, letter);
            wsBroadcastLetter(letter, accumulatedDots);
        }
        
        accumulatedDots = 0;
        waitingForRelease = false;
    }
    
    // Spacebar standalone (released without other keys)
    if (spacebarLast && !newSpacebar && newKeyState == 0 && !waitingForRelease) {
        // Only broadcast standalone space if no other keys were pressed
        if (accumulatedDots == 0) {
            lastDecodedChar = ' ';
            wsBroadcastLetter(' ', 0);
        }
    }
    
    lastKeyState = newKeyState;
    spacebarLast = newSpacebar;
    currentKeyState = newKeyState;
    spacebarState = newSpacebar;
}

// ==================== DFPLAYER FUNCTIONS ====================

void initDFPlayer() {
    // TX only - we don't need to read from DFPlayer
    dfpSerial.begin(9600, SERIAL_8N1, -1, PIN_DFP_TX);  // RX=-1 (not used), TX=17
    delay(200);
    
    // Set volume to reasonable level (0-30)
    dfpSetVolume(20);
}

void dfpSendCommand(uint8_t cmd, uint16_t param) {
    // DFPlayer Mini command frame:
    // [0x7E] [0xFF] [0x06] [CMD] [FB] [PARAM_H] [PARAM_L] [CHECKSUM_H] [CHECKSUM_L] [0xEF]
    
    uint8_t frame[10];
    frame[0] = 0x7E;           // Start byte
    frame[1] = 0xFF;           // Version
    frame[2] = 0x06;           // Length
    frame[3] = cmd;            // Command
    frame[4] = 0x00;           // Feedback: 0 = no feedback
    frame[5] = (param >> 8);   // Parameter high byte
    frame[6] = (param & 0xFF); // Parameter low byte
    
    // Checksum = -(sum of bytes 1-6)
    int16_t checksum = -(frame[1] + frame[2] + frame[3] + frame[4] + frame[5] + frame[6]);
    frame[7] = (checksum >> 8);
    frame[8] = (checksum & 0xFF);
    frame[9] = 0xEF;           // End byte
    
    dfpSerial.write(frame, 10);
}

void dfpSetVolume(uint8_t volume) {
    // Command 0x06: Set volume (0-30)
    if (volume > 30) volume = 30;
    dfpSendCommand(0x06, volume);
    delay(50);
}

void dfpPlayFolder(uint8_t folder, uint8_t file) {
    // Command 0x0F: Play specific file in folder
    // Param: high byte = folder, low byte = file
    uint16_t param = ((uint16_t)folder << 8) | file;
    dfpSendCommand(0x0F, param);
}

// ==================== CONFIGURATION MANAGEMENT ====================

void loadConfig() {
    prefs.begin("amc1", true);
    
    String ssid = prefs.getString("ssid", "");
    String wifiPass = prefs.getString("wifiPass", "");
    String apiUser = prefs.getString("apiUser", DEFAULT_API_USER);
    String apiPass = prefs.getString("apiPass", DEFAULT_API_PASS);
    
    strncpy(config.ssid, ssid.c_str(), 32);
    strncpy(config.wifiPass, wifiPass.c_str(), 64);
    strncpy(config.apiUser, apiUser.c_str(), 32);
    strncpy(config.apiPass, apiPass.c_str(), 64);
    
    config.pixelOnTime = prefs.getULong("pixelOn", DEFAULT_PIXEL_ON_TIME_US);
    config.pixelOffTime = prefs.getULong("pixelOff", DEFAULT_PIXEL_OFF_TIME_US);
    config.rowDwellTime = prefs.getULong("rowDwell", DEFAULT_ROW_DWELL_US);
    config.loopEnabled = prefs.getBool("loopEnabled", false);
    config.latchingMode = prefs.getBool("latching", false);
    config.refreshInterval = prefs.getUShort("refreshInt", 50);  // Default: refresh every 50 cycles
    config.updateOnlyMode = prefs.getBool("updateOnly", false);
    config.updateOnlyDir = prefs.getUChar("updateDir", 0);  // 0=both
    config.fullRefreshOnUpdate = prefs.getBool("fullRefresh", false);
    
    prefs.end();
}

void saveConfig() {
    prefs.begin("amc1", false);
    
    prefs.putString("ssid", config.ssid);
    prefs.putString("wifiPass", config.wifiPass);
    prefs.putString("apiUser", config.apiUser);
    prefs.putString("apiPass", config.apiPass);
    prefs.putULong("pixelOn", config.pixelOnTime);
    prefs.putULong("pixelOff", config.pixelOffTime);
    prefs.putULong("rowDwell", config.rowDwellTime);
    prefs.putBool("loopEnabled", config.loopEnabled);
    prefs.putBool("latching", config.latchingMode);
    prefs.putUShort("refreshInt", config.refreshInterval);
    prefs.putBool("updateOnly", config.updateOnlyMode);
    prefs.putUChar("updateDir", config.updateOnlyDir);
    prefs.putBool("fullRefresh", config.fullRefreshOnUpdate);
    
    prefs.end();
}

// ==================== WIFI SETUP ====================

void setupWiFi() {
    if (strlen(config.ssid) > 0) {
        Serial.printf("Connecting to WiFi: %s\n", config.ssid);
        WiFi.mode(WIFI_STA);
        WiFi.begin(config.ssid, config.wifiPass);
        
        int attempts = 0;
        while (WiFi.status() != WL_CONNECTED && attempts < 30) {
            delay(500);
            Serial.print(".");
            attempts++;
        }
        
        if (WiFi.status() == WL_CONNECTED) {
            wifiConnected = true;
            apMode = false;
            Serial.printf("\nConnected! IP: %s\n", WiFi.localIP().toString().c_str());
            return;
        }
    }
    
    // Fall back to AP mode
    Serial.println("\nStarting AP mode...");
    WiFi.mode(WIFI_AP);
    WiFi.softAP("AMC1-Setup", "amc1setup");
    apMode = true;
    Serial.printf("AP IP: %s\n", WiFi.softAPIP().toString().c_str());
}

// ==================== WEB SERVER HANDLERS ====================

bool checkMasterAuth() {
    if (!server.hasHeader("Authorization")) {
        return false;
    }
    String auth = server.header("Authorization");
    // Simple password check via header or check form data
    return true;  // Will verify in individual handlers
}

void handleRoot() {
    String html = R"rawliteral(
<!DOCTYPE html>
<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>AMC-1 Controller</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #1a1a2e; color: #eee; padding: 20px;
        }
        .container { max-width: 900px; margin: 0 auto; }
        h1 { color: #00d4ff; margin-bottom: 20px; text-align: center; }
        h2 { color: #00d4ff; margin: 20px 0 10px; font-size: 1.2em; }
        .card {
            background: #16213e; border-radius: 10px; padding: 20px;
            margin-bottom: 20px; box-shadow: 0 4px 6px rgba(0,0,0,0.3);
        }
        .grid-container {
            display: grid; gap: 3px; margin: 20px 0;
            grid-template-columns: repeat(15, 1fr);
        }
        .pixel {
            aspect-ratio: 1; border-radius: 4px; cursor: pointer;
            background: #2d3748; border: 1px solid #4a5568;
            transition: all 0.15s;
        }
        .pixel.up { background: #00d4ff; box-shadow: 0 0 10px #00d4ff; }
        .pixel.down { background: #ff6b6b; box-shadow: 0 0 10px #ff6b6b; }
        .pixel:hover { transform: scale(1.1); }
        input, button, select {
            padding: 10px 15px; border-radius: 5px; border: none;
            font-size: 14px; margin: 5px;
        }
        input { background: #2d3748; color: #fff; width: 100%; }
        button {
            background: #00d4ff; color: #1a1a2e; cursor: pointer;
            font-weight: bold; transition: all 0.2s;
        }
        button:hover { background: #00b4df; transform: translateY(-2px); }
        button.danger { background: #ff6b6b; }
        button.success { background: #4ade80; }
        button.secondary { background: #6b7280; color: #fff; }
        .btn-group { display: flex; flex-wrap: wrap; gap: 10px; margin: 15px 0; }
        .form-group { margin: 15px 0; }
        .form-group label { display: block; margin-bottom: 5px; color: #9ca3af; }
        .form-row { display: flex; gap: 15px; flex-wrap: wrap; }
        .form-row > div { flex: 1; min-width: 200px; }
        .status { padding: 10px; border-radius: 5px; margin: 10px 0; }
        .status.connected { background: rgba(74, 222, 128, 0.2); border: 1px solid #4ade80; }
        .status.disconnected { background: rgba(255, 107, 107, 0.2); border: 1px solid #ff6b6b; }
        .timing-display { font-family: monospace; color: #00d4ff; }
        #loginOverlay {
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.9); display: flex;
            align-items: center; justify-content: center; z-index: 1000;
        }
        #loginBox { background: #16213e; padding: 40px; border-radius: 10px; text-align: center; }
        .hidden { display: none !important; }
        .loop-indicator {
            display: inline-block; width: 12px; height: 12px;
            border-radius: 50%; margin-right: 8px;
        }
        .loop-indicator.active { background: #4ade80; animation: pulse 1s infinite; }
        .loop-indicator.inactive { background: #6b7280; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        .draw-mode { margin: 10px 0; }
        .draw-mode button { margin: 2px; }
        .draw-mode button.active { outline: 3px solid #fff; }
        
        .braille-key {
            background: #2d3748; border: 2px solid #4a5568;
            border-radius: 8px; padding: 10px; text-align: center;
            transition: all 0.1s;
        }
        .braille-key.pressed {
            background: #00d4ff; color: #1a1a2e;
            border-color: #00d4ff;
            box-shadow: 0 0 15px #00d4ff;
        }
        .braille-key .key-name { font-size: 20px; font-weight: bold; }
        .braille-key .key-dot { font-size: 11px; color: #9ca3af; margin-top: 4px; }
        .braille-key.pressed .key-dot { color: #1a1a2e; }
        .braille-key.spacebar {
            grid-column: 1 / -1;
            max-width: 400px;
        }
    </style>
</head>
<body>
    <div id="loginOverlay">
        <div id="loginBox">
            <h2>Master Access</h2>
            <input type="password" id="masterPass" placeholder="Enter master password">
            <br><br>
            <button onclick="login()">Login</button>
        </div>
    </div>
    
    <div class="container hidden" id="mainContent">
        <h1>AMC-1 Matrix Controller</h1>
        
        <div class="card">
            <h2>Display Canvas (15x10)</h2>
            <div class="draw-mode">
                <span>Draw Mode:</span>
                <button id="modeUp" class="active" onclick="setDrawMode(1)">Up (Blue)</button>
                <button id="modeDown" onclick="setDrawMode(-1)">Down (Red)</button>
                <button id="modeOff" onclick="setDrawMode(0)">Off</button>
            </div>
            <div class="grid-container" id="pixelGrid"></div>
            <div class="btn-group">
                <button onclick="sendDisplay()">Send to Display</button>
                <button onclick="clearDisplay()" class="secondary">Clear All</button>
                <button onclick="fillAll(1)">Fill Up</button>
                <button onclick="fillAll(-1)">Fill Down</button>
                <button onclick="invertDisplay()">Invert</button>
            </div>
        </div>
        
        <div class="card">
            <h2>Display Control</h2>
            <div class="status" id="loopStatus">
                <span class="loop-indicator inactive" id="loopIndicator"></span>
                Loop: <span id="loopStateText">Disabled</span>
            </div>
            <div class="btn-group">
                <button onclick="toggleLoop()" id="loopToggleBtn">Enable Loop</button>
                <button onclick="stopDisplay()" class="danger">Stop Display</button>
                <button onclick="singleFrame()" class="secondary">Single Frame</button>
            </div>
        </div>
        
        <div class="card">
            <h2>Timing Settings</h2>
            <div class="form-row">
                <div class="form-group">
                    <label>Pixel On Time (µs)</label>
                    <input type="number" id="pixelOnTime" value="5000" min="100" max="100000">
                </div>
                <div class="form-group">
                    <label>Pixel Off Time (µs)</label>
                    <input type="number" id="pixelOffTime" value="1000" min="0" max="100000">
                </div>
            </div>
            <button onclick="updateTiming()">Apply Timing</button>
        </div>
        
        <div class="card">
            <h2>Latching Mode (Experimental)</h2>
            <p style="color: #9ca3af; margin-bottom: 15px;">
                Power-saving modes for bistable/mechanically-latched pixels.
                Reduces power consumption and heat by skipping unnecessary actuations.
            </p>
            
            <div class="status" id="latchingStatus">
                <span class="loop-indicator inactive" id="latchingIndicator"></span>
                Latching: <span id="latchingStateText">Disabled</span>
            </div>
            <div class="form-group">
                <label>Refresh Interval (cycles between re-actuations)</label>
                <input type="number" id="refreshInterval" value="50" min="1" max="10000">
                <small style="color: #9ca3af;">Higher values = more power saving but more drift risk</small>
            </div>
            <div class="btn-group">
                <button onclick="toggleLatching()" id="latchingToggleBtn">Enable Latching</button>
                <button onclick="updateRefreshInterval()" class="secondary">Apply Interval</button>
            </div>
            
            <hr style="border-color: #2d3748; margin: 20px 0;">
            
            <div class="status" id="updateOnlyStatus">
                <span class="loop-indicator inactive" id="updateOnlyIndicator"></span>
                Update-Only Mode: <span id="updateOnlyStateText">Disabled</span>
            </div>
            <p style="color: #9ca3af; font-size: 13px; margin: 10px 0;">
                When enabled, pixels are only actuated when their state changes. 
                No periodic refresh - maximum power saving but no drift compensation.
            </p>
            <div class="form-group">
                <label>Apply Update-Only To:</label>
                <select id="updateOnlyDir" onchange="updateUpdateOnlyDir()" 
                        style="padding: 10px; border-radius: 5px; background: #2d3748; 
                               color: #fff; border: 1px solid #4a5568; width: 100%;">
                    <option value="0">Both directions (up & down)</option>
                    <option value="1">Down pulls only</option>
                    <option value="2">Up pulls only</option>
                </select>
                <small style="color: #9ca3af;">
                    Choose which polarity benefits from update-only mode. 
                    The other direction will continue to refresh normally (or per latching settings).
                </small>
            </div>
            <button onclick="toggleUpdateOnly()" id="updateOnlyToggleBtn">Enable Update-Only</button>
            
            <hr style="border-color: #2d3748; margin: 20px 0;">
            
            <div class="status" id="fullRefreshStatus">
                <span class="loop-indicator inactive" id="fullRefreshIndicator"></span>
                Full Refresh on Update: <span id="fullRefreshStateText">Disabled</span>
            </div>
            <p style="color: #9ca3af; font-size: 13px; margin: 10px 0;">
                When new data arrives, refresh ALL pixels (not just the ones that changed). 
                Useful for ensuring consistent display state after updates.
            </p>
            <button onclick="toggleFullRefresh()" id="fullRefreshToggleBtn">Enable Full Refresh</button>
        </div>
        
        <div class="card">
            <h2>Audio Test (DFPlayer)</h2>
            <div class="btn-group">
                <button onclick="playAudio(1, 1)">Play Folder 1 / File 1</button>
                <button onclick="playAudio(2, 1)">Play Folder 2 / File 1</button>
                <button onclick="readoutIP()" class="secondary">Readout IP Address</button>
            </div>
        </div>
        
        <div class="card">
            <h2>Braille Keyboard Debug</h2>
            <div id="kbStatus" class="status disconnected">WebSocket: Disconnected</div>
            
            <h3 style="color: #00d4ff; margin: 15px 0 10px;">Last Decoded Character</h3>
            <div style="display: flex; gap: 20px; align-items: center; margin: 15px 0;">
                <div style="font-size: 64px; font-weight: bold; color: #00d4ff; 
                            background: #2d3748; padding: 10px 30px; border-radius: 10px;
                            min-width: 120px; text-align: center;" id="lastLetter">-</div>
                <div>
                    <div style="color: #9ca3af;">Dot Pattern:</div>
                    <div style="font-family: monospace; font-size: 18px; color: #00d4ff;" id="lastDots">none</div>
                </div>
            </div>
            
            <h3 style="color: #00d4ff; margin: 20px 0 10px;">Live Key States</h3>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; max-width: 300px;">
                <div class="braille-key" id="dot1">
                    <div class="key-name">A</div>
                    <div class="key-dot">Dot 1</div>
                </div>
                <div class="braille-key" id="dot4">
                    <div class="key-name">J</div>
                    <div class="key-dot">Dot 4</div>
                </div>
                <div class="braille-key" id="dot2">
                    <div class="key-name">S</div>
                    <div class="key-dot">Dot 2</div>
                </div>
                <div class="braille-key" id="dot5">
                    <div class="key-name">K</div>
                    <div class="key-dot">Dot 5</div>
                </div>
                <div class="braille-key" id="dot3">
                    <div class="key-name">D</div>
                    <div class="key-dot">Dot 3</div>
                </div>
                <div class="braille-key" id="dot6">
                    <div class="key-name">L</div>
                    <div class="key-dot">Dot 6</div>
                </div>
                <div class="braille-key" id="dot7">
                    <div class="key-name">F</div>
                    <div class="key-dot">Dot 7</div>
                </div>
                <div class="braille-key" id="dot8">
                    <div class="key-name">;</div>
                    <div class="key-dot">Dot 8</div>
                </div>
            </div>
            <div class="braille-key" id="spacebar" style="margin-top: 10px; max-width: 300px;">
                <div class="key-name">SPACE</div>
            </div>
            
            <h3 style="color: #00d4ff; margin: 20px 0 10px;">Recent Letters</h3>
            <div id="letterLog" style="background: #2d3748; padding: 15px; border-radius: 5px;
                                        font-family: monospace; font-size: 18px; color: #00d4ff;
                                        min-height: 50px; word-wrap: break-word;"></div>
            <button onclick="clearLetterLog()" class="secondary" style="margin-top: 10px;">Clear Log</button>
        </div>
        
        <div class="card">
            <h2>API Configuration</h2>
            <div class="form-row">
                <div class="form-group">
                    <label>API Username</label>
                    <input type="text" id="apiUser" placeholder="api_user">
                </div>
                <div class="form-group">
                    <label>API Password</label>
                    <input type="password" id="apiPass" placeholder="api_pass">
                </div>
            </div>
            <button onclick="updateApiCreds()">Update API Credentials</button>
        </div>
        
        <div class="card">
            <h2>WiFi Configuration</h2>
            <div class="status" id="wifiStatus">Loading WiFi status...</div>
            <div class="form-group">
                <label>SSID</label>
                <input type="text" id="wifiSSID" placeholder="Network name">
            </div>
            <div class="form-group">
                <label>Password</label>
                <input type="password" id="wifiPass" placeholder="Network password">
            </div>
            <button onclick="updateWiFi()">Save & Reconnect</button>
        </div>
    </div>
    
    <script>
        let masterPassword = '';
        let pixels = Array(10).fill().map(() => Array(15).fill(0));
        let drawMode = 1;
        let loopEnabled = false;
        
        function login() {
            masterPassword = document.getElementById('masterPass').value;
            fetch('/api/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: masterPassword })
            })
            .then(r => r.json())
            .then(data => {
                if (data.success) {
                    document.getElementById('loginOverlay').classList.add('hidden');
                    document.getElementById('mainContent').classList.remove('hidden');
                    loadStatus();
                    connectWebSockets();
                } else {
                    alert('Invalid password');
                }
            });
        }
        
        document.getElementById('masterPass').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') login();
        });
        
        function initGrid() {
            const grid = document.getElementById('pixelGrid');
            grid.innerHTML = '';
            for (let row = 0; row < 10; row++) {
                for (let col = 0; col < 15; col++) {
                    const pixel = document.createElement('div');
                    pixel.className = 'pixel';
                    pixel.dataset.row = row;
                    pixel.dataset.col = col;
                    pixel.addEventListener('click', () => togglePixel(row, col));
                    pixel.addEventListener('mouseenter', (e) => {
                        if (e.buttons === 1) togglePixel(row, col);
                    });
                    grid.appendChild(pixel);
                }
            }
        }
        
        function togglePixel(row, col) {
            pixels[row][col] = drawMode;
            updatePixelDisplay(row, col);
        }
        
        function updatePixelDisplay(row, col) {
            const idx = row * 15 + col;
            const pixel = document.querySelectorAll('.pixel')[idx];
            pixel.className = 'pixel';
            if (pixels[row][col] > 0) pixel.classList.add('up');
            else if (pixels[row][col] < 0) pixel.classList.add('down');
        }
        
        function updateAllPixels() {
            for (let row = 0; row < 10; row++) {
                for (let col = 0; col < 15; col++) {
                    updatePixelDisplay(row, col);
                }
            }
        }
        
        function setDrawMode(mode) {
            drawMode = mode;
            document.querySelectorAll('.draw-mode button').forEach(b => b.classList.remove('active'));
            if (mode === 1) document.getElementById('modeUp').classList.add('active');
            else if (mode === -1) document.getElementById('modeDown').classList.add('active');
            else document.getElementById('modeOff').classList.add('active');
        }
        
        function clearDisplay() {
            pixels = Array(10).fill().map(() => Array(15).fill(0));
            updateAllPixels();
        }
        
        function fillAll(val) {
            pixels = Array(10).fill().map(() => Array(15).fill(val));
            updateAllPixels();
        }
        
        function invertDisplay() {
            for (let row = 0; row < 10; row++) {
                for (let col = 0; col < 15; col++) {
                    pixels[row][col] = -pixels[row][col];
                }
            }
            updateAllPixels();
        }
        
        function apiCall(endpoint, data) {
            return fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...data, password: masterPassword })
            }).then(r => r.json());
        }
        
        function sendDisplay() {
            apiCall('/api/display', { pixels: pixels })
            .then(data => {
                if (!data.success) alert('Error: ' + data.error);
            });
        }
        
        function toggleLoop() {
            loopEnabled = !loopEnabled;
            apiCall('/api/loop', { enabled: loopEnabled })
            .then(data => {
                if (data.success) updateLoopUI();
            });
        }
        
        function updateLoopUI() {
            const indicator = document.getElementById('loopIndicator');
            const text = document.getElementById('loopStateText');
            const btn = document.getElementById('loopToggleBtn');
            
            if (loopEnabled) {
                indicator.className = 'loop-indicator active';
                text.textContent = 'Running';
                btn.textContent = 'Disable Loop';
                btn.className = 'danger';
            } else {
                indicator.className = 'loop-indicator inactive';
                text.textContent = 'Disabled';
                btn.textContent = 'Enable Loop';
                btn.className = '';
            }
        }
        
        function stopDisplay() {
            loopEnabled = false;
            apiCall('/api/stop', {}).then(() => updateLoopUI());
        }
        
        function singleFrame() {
            apiCall('/api/frame', { pixels: pixels });
        }
        
        function updateTiming() {
            const onTime = parseInt(document.getElementById('pixelOnTime').value);
            const offTime = parseInt(document.getElementById('pixelOffTime').value);
            apiCall('/api/timing', { pixelOnTime: onTime, pixelOffTime: offTime })
            .then(data => {
                if (data.success) alert('Timing updated');
            });
        }
        
        let latchingEnabled = false;
        let updateOnlyEnabled = false;
        let fullRefreshEnabled = false;
        
        function toggleLatching() {
            latchingEnabled = !latchingEnabled;
            apiCall('/api/latching', { enabled: latchingEnabled })
            .then(data => {
                if (data.success) updateLatchingUI();
            });
        }
        
        function updateLatchingUI() {
            const indicator = document.getElementById('latchingIndicator');
            const text = document.getElementById('latchingStateText');
            const btn = document.getElementById('latchingToggleBtn');
            
            if (latchingEnabled) {
                indicator.className = 'loop-indicator active';
                text.textContent = 'Active';
                btn.textContent = 'Disable Latching';
                btn.className = 'danger';
            } else {
                indicator.className = 'loop-indicator inactive';
                text.textContent = 'Disabled';
                btn.textContent = 'Enable Latching';
                btn.className = '';
            }
        }
        
        function updateRefreshInterval() {
            const interval = parseInt(document.getElementById('refreshInterval').value);
            apiCall('/api/latching', { refreshInterval: interval })
            .then(data => {
                if (data.success) alert('Refresh interval updated');
            });
        }
        
        function toggleUpdateOnly() {
            updateOnlyEnabled = !updateOnlyEnabled;
            apiCall('/api/latching', { updateOnly: updateOnlyEnabled })
            .then(data => {
                if (data.success) updateUpdateOnlyUI();
            });
        }
        
        function updateUpdateOnlyDir() {
            const dir = parseInt(document.getElementById('updateOnlyDir').value);
            apiCall('/api/latching', { updateOnlyDir: dir })
            .then(data => {
                if (!data.success) alert('Error updating direction');
            });
        }
        
        function updateUpdateOnlyUI() {
            const indicator = document.getElementById('updateOnlyIndicator');
            const text = document.getElementById('updateOnlyStateText');
            const btn = document.getElementById('updateOnlyToggleBtn');
            
            if (updateOnlyEnabled) {
                indicator.className = 'loop-indicator active';
                text.textContent = 'Active';
                btn.textContent = 'Disable Update-Only';
                btn.className = 'danger';
            } else {
                indicator.className = 'loop-indicator inactive';
                text.textContent = 'Disabled';
                btn.textContent = 'Enable Update-Only';
                btn.className = '';
            }
        }
        
        function toggleFullRefresh() {
            fullRefreshEnabled = !fullRefreshEnabled;
            apiCall('/api/latching', { fullRefreshOnUpdate: fullRefreshEnabled })
            .then(data => {
                if (data.success) updateFullRefreshUI();
            });
        }
        
        function updateFullRefreshUI() {
            const indicator = document.getElementById('fullRefreshIndicator');
            const text = document.getElementById('fullRefreshStateText');
            const btn = document.getElementById('fullRefreshToggleBtn');
            
            if (fullRefreshEnabled) {
                indicator.className = 'loop-indicator active';
                text.textContent = 'Active';
                btn.textContent = 'Disable Full Refresh';
                btn.className = 'danger';
            } else {
                indicator.className = 'loop-indicator inactive';
                text.textContent = 'Disabled';
                btn.textContent = 'Enable Full Refresh';
                btn.className = '';
            }
        }
        
        function updateApiCreds() {
            const user = document.getElementById('apiUser').value;
            const pass = document.getElementById('apiPass').value;
            apiCall('/api/credentials', { apiUser: user, apiPass: pass })
            .then(data => {
                if (data.success) alert('API credentials updated');
            });
        }
        
        function updateWiFi() {
            const ssid = document.getElementById('wifiSSID').value;
            const pass = document.getElementById('wifiPass').value;
            apiCall('/api/wifi', { ssid: ssid, wifiPass: pass })
            .then(data => {
                if (data.success) alert('WiFi settings saved. Device will reconnect.');
            });
        }
        
        function playAudio(folder, file) {
            apiCall('/api/audio', { folder: folder, file: file })
            .then(data => {
                if (!data.success) alert('Error: ' + data.error);
            });
        }
        
        function readoutIP() {
            apiCall('/api/readout-ip', {})
            .then(data => {
                if (!data.success) alert('Error: ' + data.error);
            });
        }
        
        // ==================== WebSocket for Keyboard ====================
        let wsKeys = null;
        let wsLetters = null;
        let letterHistory = '';
        
        function connectWebSockets() {
            const host = window.location.hostname;
            
            // Key state WebSocket
            wsKeys = new WebSocket(`ws://${host}:81/`);
            wsKeys.onopen = () => {
                document.getElementById('kbStatus').className = 'status connected';
                document.getElementById('kbStatus').textContent = 'WebSocket: Connected';
            };
            wsKeys.onclose = () => {
                document.getElementById('kbStatus').className = 'status disconnected';
                document.getElementById('kbStatus').textContent = 'WebSocket: Disconnected (reconnecting...)';
                setTimeout(connectWebSockets, 2000);
            };
            wsKeys.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    if (msg.type === 'keystate') {
                        updateKeyDisplay(msg.keys, msg.spacebar);
                    }
                } catch(e) {}
            };
            
            // Letter output WebSocket
            function connectLettersWS() {
                wsLetters = new WebSocket(`ws://${host}:82/`);
                wsLetters.onmessage = (event) => {
                    try {
                        const msg = JSON.parse(event.data);
                        if (msg.type === 'letter') {
                            document.getElementById('lastLetter').textContent = msg.letter || '?';
                            document.getElementById('lastDots').textContent = 
                                msg.dotString.length > 0 ? 'Dots: ' + msg.dotString : 'none';
                            
                            letterHistory += msg.letter;
                            if (letterHistory.length > 200) {
                                letterHistory = letterHistory.slice(-200);
                            }
                            document.getElementById('letterLog').textContent = letterHistory;
                        }
                    } catch(e) {}
                };
                wsLetters.onclose = () => {
                    setTimeout(connectLettersWS, 2000);
                };
            }
            connectLettersWS();
        }
        
        function updateKeyDisplay(keys, spacebar) {
            // Bit positions match KEY_*_DOT* defines in firmware
            // GP0=dot1, GP1=dot2, GP2=dot3, GP3=dot7
            // GP4=dot4, GP5=dot5, GP6=dot6, GP7=dot8
            const mapping = [1, 2, 3, 7, 4, 5, 6, 8];  // bit -> dot number
            
            for (let bit = 0; bit < 8; bit++) {
                const dotNum = mapping[bit];
                const elem = document.getElementById('dot' + dotNum);
                if (elem) {
                    if ((keys >> bit) & 0x01) {
                        elem.classList.add('pressed');
                    } else {
                        elem.classList.remove('pressed');
                    }
                }
            }
            
            const sb = document.getElementById('spacebar');
            if (spacebar) sb.classList.add('pressed');
            else sb.classList.remove('pressed');
        }
        
        function clearLetterLog() {
            letterHistory = '';
            document.getElementById('letterLog').textContent = '';
        }
        
        function loadStatus() {
            apiCall('/api/status', {})
            .then(data => {
                if (data.success) {
                    document.getElementById('pixelOnTime').value = data.pixelOnTime;
                    document.getElementById('pixelOffTime').value = data.pixelOffTime;
                    document.getElementById('apiUser').value = data.apiUser;
                    document.getElementById('wifiSSID').value = data.ssid || '';
                    document.getElementById('refreshInterval').value = data.refreshInterval || 50;
                    loopEnabled = data.loopEnabled;
                    latchingEnabled = data.latchingMode || false;
                    updateOnlyEnabled = data.updateOnly || false;
                    fullRefreshEnabled = data.fullRefreshOnUpdate || false;
                    document.getElementById('updateOnlyDir').value = data.updateOnlyDir || 0;
                    updateLoopUI();
                    updateLatchingUI();
                    updateUpdateOnlyUI();
                    updateFullRefreshUI();
                    
                    const wifiStatus = document.getElementById('wifiStatus');
                    if (data.wifiConnected) {
                        wifiStatus.className = 'status connected';
                        wifiStatus.innerHTML = 'Connected to: ' + data.ssid + '<br>IP: ' + data.ip;
                    } else {
                        wifiStatus.className = 'status disconnected';
                        wifiStatus.innerHTML = 'AP Mode - Connect to AMC1-Setup';
                    }
                    
                    // Load current display state
                    if (data.display) {
                        pixels = data.display;
                        updateAllPixels();
                    }
                }
            });
        }
        
        initGrid();
    </script>
</body>
</html>
)rawliteral";
    server.send(200, "text/html", html);
}

void handleApiVerify() {
    StaticJsonDocument<256> doc;
    deserializeJson(doc, server.arg("plain"));
    
    String password = doc["password"] | "";
    
    StaticJsonDocument<64> response;
    response["success"] = (password == MASTER_PASSWORD);
    
    String output;
    serializeJson(response, output);
    server.send(200, "application/json", output);
}

void handleApiStatus() {
    StaticJsonDocument<256> doc;
    deserializeJson(doc, server.arg("plain"));
    
    String password = doc["password"] | "";
    
    StaticJsonDocument<512> response;
    
    if (password == MASTER_PASSWORD) {
        response["success"] = true;
        response["pixelOnTime"] = config.pixelOnTime;
        response["pixelOffTime"] = config.pixelOffTime;
        response["apiUser"] = config.apiUser;
        response["ssid"] = config.ssid;
        response["loopEnabled"] = config.loopEnabled;
        response["latchingMode"] = config.latchingMode;
        response["refreshInterval"] = config.refreshInterval;
        response["updateOnly"] = config.updateOnlyMode;
        response["updateOnlyDir"] = config.updateOnlyDir;
        response["fullRefreshOnUpdate"] = config.fullRefreshOnUpdate;
        response["wifiConnected"] = wifiConnected;
        response["ip"] = wifiConnected ? WiFi.localIP().toString() : WiFi.softAPIP().toString();
        
        JsonArray display = response.createNestedArray("display");
        for (int row = 0; row < NUM_ROWS; row++) {
            JsonArray rowArr = display.createNestedArray();
            for (int col = 0; col < NUM_COLS; col++) {
                rowArr.add(displayBuffer[row][col]);
            }
        }
    } else {
        response["success"] = false;
        response["error"] = "Invalid password";
    }
    
    String output;
    serializeJson(response, output);
    server.send(200, "application/json", output);
}

void handleApiDisplay() {
    StaticJsonDocument<2048> doc;
    deserializeJson(doc, server.arg("plain"));
    
    String password = doc["password"] | "";
    String apiUser = doc["user"] | "";
    String apiPass = doc["pass"] | "";
    
    bool authorized = (password == MASTER_PASSWORD) || 
                      (apiUser == config.apiUser && apiPass == config.apiPass);
    
    StaticJsonDocument<128> response;
    
    if (authorized) {
        JsonArray pixels = doc["pixels"];
        if (pixels) {
            for (int row = 0; row < NUM_ROWS && row < pixels.size(); row++) {
                JsonArray rowArr = pixels[row];
                for (int col = 0; col < NUM_COLS && col < rowArr.size(); col++) {
                    int val = rowArr[col];
                    setPixel(row, col, val);
                }
            }
            notifyContentUpdate();
        }
        response["success"] = true;
    } else {
        response["success"] = false;
        response["error"] = "Unauthorized";
    }
    
    String output;
    serializeJson(response, output);
    server.send(200, "application/json", output);
}

void handleApiLoop() {
    StaticJsonDocument<256> doc;
    deserializeJson(doc, server.arg("plain"));
    
    String password = doc["password"] | "";
    
    StaticJsonDocument<128> response;
    
    if (password == MASTER_PASSWORD) {
        config.loopEnabled = doc["enabled"] | false;
        saveConfig();
        
        if (config.loopEnabled) {
            startDisplayRefresh();
        } else {
            stopDisplayRefresh();
        }
        
        wsBroadcastStatus("loop_changed");
        
        response["success"] = true;
        response["loopEnabled"] = config.loopEnabled;
    } else {
        response["success"] = false;
        response["error"] = "Unauthorized";
    }
    
    String output;
    serializeJson(response, output);
    server.send(200, "application/json", output);
}

void handleApiStop() {
    StaticJsonDocument<256> doc;
    deserializeJson(doc, server.arg("plain"));
    
    String password = doc["password"] | "";
    
    StaticJsonDocument<64> response;
    
    if (password == MASTER_PASSWORD) {
        config.loopEnabled = false;
        stopDisplayRefresh();
        wsBroadcastStatus("display_stopped");
        response["success"] = true;
    } else {
        response["success"] = false;
    }
    
    String output;
    serializeJson(response, output);
    server.send(200, "application/json", output);
}

void handleApiFrame() {
    StaticJsonDocument<2048> doc;
    deserializeJson(doc, server.arg("plain"));
    
    String password = doc["password"] | "";
    String apiUser = doc["user"] | "";
    String apiPass = doc["pass"] | "";
    
    bool authorized = (password == MASTER_PASSWORD) || 
                      (apiUser == config.apiUser && apiPass == config.apiPass);
    
    StaticJsonDocument<128> response;
    
    if (authorized) {
        JsonArray pixels = doc["pixels"];
        if (pixels) {
            for (int row = 0; row < NUM_ROWS && row < pixels.size(); row++) {
                JsonArray rowArr = pixels[row];
                for (int col = 0; col < NUM_COLS && col < rowArr.size(); col++) {
                    int val = rowArr[col];
                    setPixel(row, col, val);
                }
            }
        }
        
        // Run single frame
        bool wasLooping = config.loopEnabled;
        config.loopEnabled = false;
        stopDisplayRefresh();
        
        // Manual single-frame refresh
        uint8_t shiftData[6];
        int8_t rowPixels[NUM_COLS];
        
        enableOutput(true);
        for (int row = 0; row < NUM_ROWS; row++) {
            for (int col = 0; col < NUM_COLS; col++) {
                rowPixels[col] = displayBuffer[row][col];
            }
            
            buildShiftRegisterData(shiftData, row, rowPixels);
            shiftOut48Bits(shiftData);
            delayMicroseconds(config.pixelOnTime);
            allRowsOff();
            delayMicroseconds(config.pixelOffTime);
        }
        enableOutput(false);
        
        response["success"] = true;
    } else {
        response["success"] = false;
        response["error"] = "Unauthorized";
    }
    
    String output;
    serializeJson(response, output);
    server.send(200, "application/json", output);
}

void handleApiTiming() {
    StaticJsonDocument<256> doc;
    deserializeJson(doc, server.arg("plain"));
    
    String password = doc["password"] | "";
    
    StaticJsonDocument<128> response;
    
    if (password == MASTER_PASSWORD) {
        if (doc.containsKey("pixelOnTime")) {
            config.pixelOnTime = doc["pixelOnTime"];
        }
        if (doc.containsKey("pixelOffTime")) {
            config.pixelOffTime = doc["pixelOffTime"];
        }
        saveConfig();
        wsBroadcastStatus("timing_changed");
        response["success"] = true;
    } else {
        response["success"] = false;
    }
    
    String output;
    serializeJson(response, output);
    server.send(200, "application/json", output);
}

void handleApiCredentials() {
    StaticJsonDocument<256> doc;
    deserializeJson(doc, server.arg("plain"));
    
    String password = doc["password"] | "";
    
    StaticJsonDocument<128> response;
    
    if (password == MASTER_PASSWORD) {
        if (doc.containsKey("apiUser")) {
            strncpy(config.apiUser, doc["apiUser"] | "", 32);
        }
        if (doc.containsKey("apiPass")) {
            strncpy(config.apiPass, doc["apiPass"] | "", 64);
        }
        saveConfig();
        response["success"] = true;
    } else {
        response["success"] = false;
    }
    
    String output;
    serializeJson(response, output);
    server.send(200, "application/json", output);
}

void handleApiWifi() {
    StaticJsonDocument<256> doc;
    deserializeJson(doc, server.arg("plain"));
    
    String password = doc["password"] | "";
    
    StaticJsonDocument<128> response;
    
    if (password == MASTER_PASSWORD) {
        if (doc.containsKey("ssid")) {
            strncpy(config.ssid, doc["ssid"] | "", 32);
        }
        if (doc.containsKey("wifiPass")) {
            strncpy(config.wifiPass, doc["wifiPass"] | "", 64);
        }
        saveConfig();
        response["success"] = true;
        
        String output;
        serializeJson(response, output);
        server.send(200, "application/json", output);
        
        delay(1000);
        ESP.restart();
        return;
    } else {
        response["success"] = false;
    }
    
    String output;
    serializeJson(response, output);
    server.send(200, "application/json", output);
}

void handleApiAudio() {
    StaticJsonDocument<256> doc;
    deserializeJson(doc, server.arg("plain"));
    
    String password = doc["password"] | "";
    
    StaticJsonDocument<128> response;
    
    if (password == MASTER_PASSWORD) {
        uint8_t folder = doc["folder"] | 1;
        uint8_t file = doc["file"] | 1;
        
        dfpPlayFolder(folder, file);
        
        response["success"] = true;
        response["folder"] = folder;
        response["file"] = file;
    } else {
        response["success"] = false;
        response["error"] = "Unauthorized";
    }
    
    String output;
    serializeJson(response, output);
    server.send(200, "application/json", output);
}

void handleApiReadoutIP() {
    StaticJsonDocument<256> doc;
    deserializeJson(doc, server.arg("plain"));
    
    String password = doc["password"] | "";
    
    StaticJsonDocument<128> response;
    
    if (password == MASTER_PASSWORD) {
        startIpReadout();
        response["success"] = true;
    } else {
        response["success"] = false;
        response["error"] = "Unauthorized";
    }
    
    String output;
    serializeJson(response, output);
    server.send(200, "application/json", output);
}

void handleApiLatching() {
    StaticJsonDocument<256> doc;
    deserializeJson(doc, server.arg("plain"));
    
    String password = doc["password"] | "";
    String apiUser = doc["user"] | "";
    String apiPass = doc["pass"] | "";
    
    bool authorized = (password == MASTER_PASSWORD) || 
                      (apiUser == config.apiUser && apiPass == config.apiPass);
    
    StaticJsonDocument<256> response;
    
    if (authorized) {
        if (doc.containsKey("enabled")) {
            config.latchingMode = doc["enabled"];
        }
        if (doc.containsKey("refreshInterval")) {
            uint16_t interval = doc["refreshInterval"];
            if (interval > 0 && interval <= 10000) {
                config.refreshInterval = interval;
            }
        }
        if (doc.containsKey("updateOnly")) {
            config.updateOnlyMode = doc["updateOnly"];
            // If enabling update-only mode, ensure the task is running to detect updates
            if (config.updateOnlyMode && !refreshRunning) {
                startDisplayRefresh();
            }
        }
        if (doc.containsKey("updateOnlyDir")) {
            uint8_t dir = doc["updateOnlyDir"];
            if (dir <= 2) config.updateOnlyDir = dir;
        }
        if (doc.containsKey("fullRefreshOnUpdate")) {
            config.fullRefreshOnUpdate = doc["fullRefreshOnUpdate"];
        }
        // Reset all pixel ages so changes take effect immediately
        memset(pixelAge, 0, sizeof(pixelAge));
        // Force a refresh of all pixels with current state
        markAllForUpdate();
        saveConfig();
        wsBroadcastStatus("latching_changed");
        
        response["success"] = true;
        response["latchingMode"] = config.latchingMode;
        response["refreshInterval"] = config.refreshInterval;
        response["updateOnly"] = config.updateOnlyMode;
        response["updateOnlyDir"] = config.updateOnlyDir;
        response["fullRefreshOnUpdate"] = config.fullRefreshOnUpdate;
    } else {
        response["success"] = false;
        response["error"] = "Unauthorized";
    }
    
    String output;
    serializeJson(response, output);
    server.send(200, "application/json", output);
}

// Public API endpoint for external control
void handlePublicApi() {
    StaticJsonDocument<2048> doc;
    deserializeJson(doc, server.arg("plain"));
    
    String apiUser = doc["user"] | "";
    String apiPass = doc["pass"] | "";
    
    StaticJsonDocument<256> response;
    
    if (apiUser == config.apiUser && apiPass == config.apiPass) {
        String action = doc["action"] | "";
        
        if (action == "display") {
            JsonArray pixels = doc["pixels"];
            if (pixels) {
                for (int row = 0; row < NUM_ROWS && row < pixels.size(); row++) {
                    JsonArray rowArr = pixels[row];
                    for (int col = 0; col < NUM_COLS && col < rowArr.size(); col++) {
                        int val = rowArr[col];
                        setPixel(row, col, val);
                    }
                }
                notifyContentUpdate();
            }
            response["success"] = true;
        } else if (action == "pixel") {
            int row = doc["row"] | -1;
            int col = doc["col"] | -1;
            int val = doc["value"] | 0;
            
            if (row >= 0 && row < NUM_ROWS && col >= 0 && col < NUM_COLS) {
                setPixel(row, col, val);
                notifyContentUpdate();
                response["success"] = true;
            } else {
                response["success"] = false;
                response["error"] = "Invalid coordinates";
            }
        } else if (action == "clear") {
            // Mark all currently-set pixels for update before clearing
            for (int row = 0; row < NUM_ROWS; row++) {
                for (int col = 0; col < NUM_COLS; col++) {
                    if (displayBuffer[row][col] != 0) {
                        pixelNeedsUpdate[row][col] = true;
                    }
                }
            }
            memset(displayBuffer, 0, sizeof(displayBuffer));
            memset(pixelAge, 0, sizeof(pixelAge));
            notifyContentUpdate();
            response["success"] = true;
        } else if (action == "status") {
            response["success"] = true;
            response["loopEnabled"] = config.loopEnabled;
            response["refreshRunning"] = refreshRunning;
            response["latchingMode"] = config.latchingMode;
            response["refreshInterval"] = config.refreshInterval;
        } else if (action == "latching") {
            if (doc.containsKey("enabled")) {
                config.latchingMode = doc["enabled"];
            }
            if (doc.containsKey("refreshInterval")) {
                uint16_t interval = doc["refreshInterval"];
                if (interval > 0 && interval <= 10000) {
                    config.refreshInterval = interval;
                }
            }
            if (doc.containsKey("updateOnly")) {
                config.updateOnlyMode = doc["updateOnly"];
                if (config.updateOnlyMode && !refreshRunning) {
                    startDisplayRefresh();
                }
            }
            if (doc.containsKey("updateOnlyDir")) {
                uint8_t dir = doc["updateOnlyDir"];
                if (dir <= 2) config.updateOnlyDir = dir;
            }
            if (doc.containsKey("fullRefreshOnUpdate")) {
                config.fullRefreshOnUpdate = doc["fullRefreshOnUpdate"];
            }
            memset(pixelAge, 0, sizeof(pixelAge));
            markAllForUpdate();
            saveConfig();
            wsBroadcastStatus("latching_changed");
            response["success"] = true;
            response["latchingMode"] = config.latchingMode;
            response["refreshInterval"] = config.refreshInterval;
            response["updateOnly"] = config.updateOnlyMode;
            response["updateOnlyDir"] = config.updateOnlyDir;
            response["fullRefreshOnUpdate"] = config.fullRefreshOnUpdate;
        } else {
            response["success"] = false;
            response["error"] = "Unknown action";
        }
    } else {
        response["success"] = false;
        response["error"] = "Invalid credentials";
    }
    
    String output;
    serializeJson(response, output);
    server.send(200, "application/json", output);
}

void wsEventHandler(uint8_t num, WStype_t type, uint8_t* payload, size_t length) {
    // Just connection management - we only broadcast, don't receive
    if (type == WStype_CONNECTED) {
        Serial.printf("WebSocket client #%u connected\n", num);
    } else if (type == WStype_DISCONNECTED) {
        Serial.printf("WebSocket client #%u disconnected\n", num);
    }
}

void wsStatusEventHandler(uint8_t num, WStype_t type, uint8_t* payload, size_t length) {
    if (type == WStype_CONNECTED) {
        Serial.printf("Status WS client #%u connected\n", num);
        // Send full status snapshot to the newly connected client
        StaticJsonDocument<512> doc;
        doc["type"] = "status";
        doc["event"] = "connected";
        doc["loopEnabled"] = config.loopEnabled;
        doc["latchingMode"] = config.latchingMode;
        doc["refreshInterval"] = config.refreshInterval;
        doc["updateOnly"] = config.updateOnlyMode;
        doc["updateOnlyDir"] = config.updateOnlyDir;
        doc["fullRefreshOnUpdate"] = config.fullRefreshOnUpdate;
        doc["refreshRunning"] = refreshRunning;
        doc["wifiConnected"] = wifiConnected;
        doc["ip"] = wifiConnected ? WiFi.localIP().toString() : WiFi.softAPIP().toString();
        doc["pixelOnTime"] = config.pixelOnTime;
        doc["pixelOffTime"] = config.pixelOffTime;
        doc["uptime"] = millis() / 1000;
        doc["freeHeap"] = ESP.getFreeHeap();
        doc["wifiRssi"] = wifiConnected ? WiFi.RSSI() : 0;
        
        String output;
        serializeJson(doc, output);
        wsStatus.sendTXT(num, output);
    }
}

void setupWebServer() {
    server.on("/", HTTP_GET, handleRoot);
    server.on("/api/verify", HTTP_POST, handleApiVerify);
    server.on("/api/status", HTTP_POST, handleApiStatus);
    server.on("/api/display", HTTP_POST, handleApiDisplay);
    server.on("/api/loop", HTTP_POST, handleApiLoop);
    server.on("/api/stop", HTTP_POST, handleApiStop);
    server.on("/api/frame", HTTP_POST, handleApiFrame);
    server.on("/api/timing", HTTP_POST, handleApiTiming);
    server.on("/api/credentials", HTTP_POST, handleApiCredentials);
    server.on("/api/wifi", HTTP_POST, handleApiWifi);
    server.on("/api/audio", HTTP_POST, handleApiAudio);
    server.on("/api/readout-ip", HTTP_POST, handleApiReadoutIP);
    server.on("/api/latching", HTTP_POST, handleApiLatching);
    server.on("/api/public", HTTP_POST, handlePublicApi);
    
    server.begin();
    Serial.println("Web server started");
    
    // Start WebSocket servers
    wsKeys.begin();
    wsKeys.onEvent(wsEventHandler);
    wsLetters.begin();
    wsLetters.onEvent(wsEventHandler);
    wsStatus.begin();
    wsStatus.onEvent(wsStatusEventHandler);
    Serial.println("WebSocket servers started (ports 81, 82, 83)");
}

// ==================== UART COMMAND INTERFACE ====================

void uartSendResponse(JsonDocument& response) {
    String output;
    serializeJson(response, output);
    // Reply on whichever port sent the command
    if (currentReplyPort) {
        currentReplyPort->println(output);
    } else {
        // Fallback: send on both
        Serial.println(output);
        ctrlSerial.println(output);
    }
}

void uartSendError(const char* error) {
    StaticJsonDocument<128> doc;
    doc["success"] = false;
    doc["error"] = error;
    uartSendResponse(doc);
}

void uartSendOk(JsonDocument& doc) {
    doc["success"] = true;
    uartSendResponse(doc);
}

void processUartCommand(const String& cmd) {
    // Trim whitespace
    String trimmed = cmd;
    trimmed.trim();
    if (trimmed.length() == 0) return;
    
    // Parse JSON
    StaticJsonDocument<2048> doc;
    DeserializationError err = deserializeJson(doc, trimmed);
    if (err) {
        uartSendError("Invalid JSON");
        return;
    }
    
    String action = doc["action"] | "";
    if (action.length() == 0) {
        uartSendError("Missing 'action' field");
        return;
    }
    
    // ---------- Authentication ----------
    if (action == "auth") {
        String pwd = doc["password"] | "";
        if (pwd == MASTER_PASSWORD) {
            uartAuthenticated = true;
            StaticJsonDocument<128> response;
            response["action"] = "auth";
            uartSendOk(response);
        } else {
            uartAuthenticated = false;
            uartSendError("Invalid password");
        }
        return;
    }
    
    // ---------- Unauthenticated actions ----------
    if (action == "ping") {
        StaticJsonDocument<128> response;
        response["action"] = "ping";
        response["pong"] = true;
        response["uptime"] = millis() / 1000;
        uartSendOk(response);
        return;
    }
    
    if (action == "info") {
        StaticJsonDocument<256> response;
        response["action"] = "info";
        response["device"] = "AMC-1";
        response["firmware"] = "1.0";
        response["rows"] = NUM_ROWS;
        response["cols"] = NUM_COLS;
        response["authenticated"] = uartAuthenticated;
        uartSendOk(response);
        return;
    }
    
    // ---------- Authentication required for all below ----------
    if (!uartAuthenticated) {
        uartSendError("Not authenticated - send {\"action\":\"auth\",\"password\":\"...\"}");
        return;
    }
    
    // ---------- Stream subscription ----------
    if (action == "subscribe") {
        String stream = doc["stream"] | "";
        bool enabled = doc["enabled"] | true;
        
        StaticJsonDocument<128> response;
        response["action"] = "subscribe";
        response["stream"] = stream;
        response["enabled"] = enabled;
        
        if (stream == "keys") {
            uartSubKeys = enabled;
        } else if (stream == "letters") {
            uartSubLetters = enabled;
        } else if (stream == "status") {
            uartSubStatus = enabled;
        } else if (stream == "all") {
            uartSubKeys = enabled;
            uartSubLetters = enabled;
            uartSubStatus = enabled;
        } else {
            uartSendError("Unknown stream (use: keys, letters, status, all)");
            return;
        }
        uartSendOk(response);
        return;
    }
    
    // ---------- Status query ----------
    if (action == "status") {
        StaticJsonDocument<512> response;
        response["action"] = "status";
        response["loopEnabled"] = config.loopEnabled;
        response["latchingMode"] = config.latchingMode;
        response["refreshInterval"] = config.refreshInterval;
        response["updateOnly"] = config.updateOnlyMode;
        response["updateOnlyDir"] = config.updateOnlyDir;
        response["fullRefreshOnUpdate"] = config.fullRefreshOnUpdate;
        response["refreshRunning"] = refreshRunning;
        response["wifiConnected"] = wifiConnected;
        response["ip"] = wifiConnected ? WiFi.localIP().toString() : WiFi.softAPIP().toString();
        response["pixelOnTime"] = config.pixelOnTime;
        response["pixelOffTime"] = config.pixelOffTime;
        response["uptime"] = millis() / 1000;
        response["freeHeap"] = ESP.getFreeHeap();
        response["apiUser"] = config.apiUser;
        response["ssid"] = config.ssid;
        response["subscriptions"]["keys"] = uartSubKeys;
        response["subscriptions"]["letters"] = uartSubLetters;
        response["subscriptions"]["status"] = uartSubStatus;
        uartSendOk(response);
        return;
    }
    
    // ---------- Display control ----------
    if (action == "display") {
        JsonArray pixels = doc["pixels"];
        if (pixels) {
            for (int row = 0; row < NUM_ROWS && row < (int)pixels.size(); row++) {
                JsonArray rowArr = pixels[row];
                for (int col = 0; col < NUM_COLS && col < (int)rowArr.size(); col++) {
                    int val = rowArr[col];
                    setPixel(row, col, val);
                }
            }
            notifyContentUpdate();
        }
        StaticJsonDocument<128> response;
        response["action"] = "display";
        uartSendOk(response);
        return;
    }
    
    if (action == "pixel") {
        int row = doc["row"] | -1;
        int col = doc["col"] | -1;
        int val = doc["value"] | 0;
        
        if (row < 0 || row >= NUM_ROWS || col < 0 || col >= NUM_COLS) {
            uartSendError("Invalid coordinates");
            return;
        }
        
        setPixel(row, col, val);
        notifyContentUpdate();
        
        StaticJsonDocument<128> response;
        response["action"] = "pixel";
        response["row"] = row;
        response["col"] = col;
        response["value"] = val;
        uartSendOk(response);
        return;
    }
    
    if (action == "clear") {
        for (int row = 0; row < NUM_ROWS; row++) {
            for (int col = 0; col < NUM_COLS; col++) {
                if (displayBuffer[row][col] != 0) {
                    pixelNeedsUpdate[row][col] = true;
                }
            }
        }
        memset(displayBuffer, 0, sizeof(displayBuffer));
        memset(pixelAge, 0, sizeof(pixelAge));
        notifyContentUpdate();
        
        StaticJsonDocument<128> response;
        response["action"] = "clear";
        uartSendOk(response);
        return;
    }
    
    if (action == "loop") {
        config.loopEnabled = doc["enabled"] | false;
        saveConfig();
        if (config.loopEnabled) {
            startDisplayRefresh();
        } else {
            stopDisplayRefresh();
        }
        wsBroadcastStatus("loop_changed");
        
        StaticJsonDocument<128> response;
        response["action"] = "loop";
        response["loopEnabled"] = config.loopEnabled;
        uartSendOk(response);
        return;
    }
    
    if (action == "stop") {
        config.loopEnabled = false;
        stopDisplayRefresh();
        wsBroadcastStatus("display_stopped");
        
        StaticJsonDocument<128> response;
        response["action"] = "stop";
        uartSendOk(response);
        return;
    }
    
    // ---------- Timing ----------
    if (action == "timing") {
        if (doc.containsKey("pixelOnTime")) {
            config.pixelOnTime = doc["pixelOnTime"];
        }
        if (doc.containsKey("pixelOffTime")) {
            config.pixelOffTime = doc["pixelOffTime"];
        }
        saveConfig();
        wsBroadcastStatus("timing_changed");
        
        StaticJsonDocument<128> response;
        response["action"] = "timing";
        response["pixelOnTime"] = config.pixelOnTime;
        response["pixelOffTime"] = config.pixelOffTime;
        uartSendOk(response);
        return;
    }
    
    // ---------- Latching modes ----------
    if (action == "latching") {
        if (doc.containsKey("enabled")) {
            config.latchingMode = doc["enabled"];
        }
        if (doc.containsKey("refreshInterval")) {
            uint16_t interval = doc["refreshInterval"];
            if (interval > 0 && interval <= 10000) {
                config.refreshInterval = interval;
            }
        }
        if (doc.containsKey("updateOnly")) {
            config.updateOnlyMode = doc["updateOnly"];
            if (config.updateOnlyMode && !refreshRunning) {
                startDisplayRefresh();
            }
        }
        if (doc.containsKey("updateOnlyDir")) {
            uint8_t dir = doc["updateOnlyDir"];
            if (dir <= 2) config.updateOnlyDir = dir;
        }
        if (doc.containsKey("fullRefreshOnUpdate")) {
            config.fullRefreshOnUpdate = doc["fullRefreshOnUpdate"];
        }
        memset(pixelAge, 0, sizeof(pixelAge));
        markAllForUpdate();
        saveConfig();
        wsBroadcastStatus("latching_changed");
        
        StaticJsonDocument<256> response;
        response["action"] = "latching";
        response["latchingMode"] = config.latchingMode;
        response["refreshInterval"] = config.refreshInterval;
        response["updateOnly"] = config.updateOnlyMode;
        response["updateOnlyDir"] = config.updateOnlyDir;
        response["fullRefreshOnUpdate"] = config.fullRefreshOnUpdate;
        uartSendOk(response);
        return;
    }
    
    // ---------- Credentials ----------
    if (action == "credentials") {
        if (doc.containsKey("apiUser")) {
            strncpy(config.apiUser, doc["apiUser"] | "", 32);
        }
        if (doc.containsKey("apiPass")) {
            strncpy(config.apiPass, doc["apiPass"] | "", 64);
        }
        saveConfig();
        
        StaticJsonDocument<128> response;
        response["action"] = "credentials";
        uartSendOk(response);
        return;
    }
    
    // ---------- WiFi ----------
    if (action == "wifi") {
        if (doc.containsKey("ssid")) {
            strncpy(config.ssid, doc["ssid"] | "", 32);
        }
        if (doc.containsKey("wifiPass")) {
            strncpy(config.wifiPass, doc["wifiPass"] | "", 64);
        }
        saveConfig();
        
        StaticJsonDocument<128> response;
        response["action"] = "wifi";
        response["note"] = "Device will restart in 1s";
        uartSendOk(response);
        ctrlSerial.flush();
        delay(1000);
        ESP.restart();
        return;
    }
    
    // ---------- Audio ----------
    if (action == "audio") {
        uint8_t folder = doc["folder"] | 1;
        uint8_t file = doc["file"] | 1;
        dfpPlayFolder(folder, file);
        
        StaticJsonDocument<128> response;
        response["action"] = "audio";
        response["folder"] = folder;
        response["file"] = file;
        uartSendOk(response);
        return;
    }
    
    if (action == "readout_ip") {
        startIpReadout();
        StaticJsonDocument<128> response;
        response["action"] = "readout_ip";
        uartSendOk(response);
        return;
    }
    
    // ---------- Unknown action ----------
    uartSendError("Unknown action");
}

void processPortInput(Stream& port, Print* replyPort, UartPortState& state) {
    while (port.available()) {
        char c = port.read();
        if (c == '\n' || c == '\r') {
            if (state.buffer.length() > 0) {
                // Set reply context so responses go to the right port
                currentReplyPort = replyPort;
                currentReplyState = &state;
                processUartCommand(state.buffer);
                currentReplyPort = nullptr;
                currentReplyState = nullptr;
                state.buffer = "";
            }
        } else {
            state.buffer += c;
            // Prevent runaway buffer
            if (state.buffer.length() > 4096) {
                currentReplyPort = replyPort;
                currentReplyState = &state;
                uartSendError("Command too long");
                currentReplyPort = nullptr;
                currentReplyState = nullptr;
                state.buffer = "";
            }
        }
    }
}

void processUartInput() {
    // Process commands from USB Serial (Serial0)
    processPortInput(Serial, &Serial, usbPortState);
    // Process commands from UART2 (ctrlSerial)
    processPortInput(ctrlSerial, &ctrlSerial, uart2PortState);
}

// ==================== SETUP & LOOP ====================

void setup() {
    Serial.begin(115200);
    delay(1000);
    
    Serial.println("\n\n=== AMC-1 Active Matrix Controller ===");
    Serial.println("Initializing...");
    
    // Initialize UART2 control interface
    ctrlSerial.begin(UART_BAUD, SERIAL_8N1, PIN_UART_RX, PIN_UART_TX);
    Serial.printf("UART2 control interface on RX=%d TX=%d @ %d baud\n", 
                  PIN_UART_RX, PIN_UART_TX, UART_BAUD);
    
    // Initialize hardware
    initShiftRegister();
    allRowsOff();
    
    // Initialize DFPlayer
    initDFPlayer();
    
    // Play startup sound (folder 03, file 012)
    delay(500);
    dfpPlayFolder(3, 12);
    
    // Initialize MCP23008 (Braille keyboard)
    initMCP23008();
    
    // Initialize spacebar pin
    pinMode(PIN_SPACEBAR, INPUT_PULLUP);
    
    // Load configuration
    loadConfig();
    
    // Setup WiFi
    setupWiFi();
    
    // Setup web server
    setupWebServer();
    
    Serial.println("Ready!");
    
    // Send hello banner over both serial ports
    StaticJsonDocument<128> hello;
    hello["type"] = "hello";
    hello["device"] = "AMC-1";
    hello["firmware"] = "1.0";
    hello["msg"] = "Send {\"action\":\"auth\",\"password\":\"...\"} to authenticate";
    String helloStr;
    serializeJson(hello, helloStr);
    ctrlSerial.println(helloStr);
    Serial.println(helloStr);
}

void loop() {
    server.handleClient();
    wsKeys.loop();
    wsLetters.loop();
    wsStatus.loop();
    
    // Process incoming UART commands
    processUartInput();
    
    // Scan keyboard every ~10ms (debouncing)
    static unsigned long lastScanTime = 0;
    if (millis() - lastScanTime >= 10) {
        scanKeyboard();
        lastScanTime = millis();
    }
    
    // Update IP readout sequence
    updateIpReadout();
    
    // Periodic status heartbeat (every 5 seconds)
    static unsigned long lastStatusBroadcast = 0;
    if (millis() - lastStatusBroadcast >= 5000) {
        wsBroadcastStatus("heartbeat");
        lastStatusBroadcast = millis();
    }
    
    delay(1);
}
