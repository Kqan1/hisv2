import { ESP32_CONFIG } from '@/lib/config';

// Mutable runtime IP — can be updated via the /api/esp32/ip endpoint
let runtimeIp: string = ESP32_CONFIG.ip;

export function getEsp32Ip(): string {
    return runtimeIp;
}

export function setEsp32Ip(ip: string) {
    runtimeIp = ip;
}
