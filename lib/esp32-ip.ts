import { ESP32_CONFIG } from '@/lib/config';

// Mutable runtime IP — initialized from env, can be updated via /api/esp32/ip
let runtimeIp: string = process.env.NEXT_PUBLIC_ESP32_IP || '192.168.4.1';

export function getEsp32Ip(): string {
    return runtimeIp;
}

export function setEsp32Ip(ip: string) {
    runtimeIp = ip;
}
