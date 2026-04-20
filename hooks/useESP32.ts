'use client';

import { getESP32Service } from '@/services/esp32.service';

export function useESP32() {
  const service = getESP32Service();
  
  return {
    setPixel: service.setPixel.bind(service),
    setArray: service.setArray.bind(service),
    setTiming: service.setTiming.bind(service),
    enableLoop: service.enableLoop.bind(service),
    clear: service.clear.bind(service),
    stop: service.stop.bind(service),
    getStatus: service.getStatus.bind(service)
  };
}
