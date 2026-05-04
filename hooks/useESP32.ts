'use client';

import { useMemo } from 'react';
import { getESP32Service } from '@/services/esp32.service';

export function useESP32() {
  const service = getESP32Service();
  
  // Memoize bound methods so they are stable references across renders.
  // This prevents useEffect dependency arrays from re-firing on every render.
  return useMemo(() => ({
    setPixel: service.setPixel.bind(service),
    setArray: service.setArray.bind(service),
    setTiming: service.setTiming.bind(service),
    enableLoop: service.enableLoop.bind(service),
    clear: service.clear.bind(service),
    stop: service.stop.bind(service),
    getStatus: service.getStatus.bind(service),
    setPowerSave: service.setPowerSave.bind(service),
    getPowerSave: service.getPowerSave.bind(service),
    setIp: service.setIp.bind(service),
    getIp: service.getIp.bind(service),
    onStatus: service.onStatus.bind(service),
    getLastStatus: service.getLastStatus.bind(service),
    setLatching: service.setLatching.bind(service),
  }), [service]);
}
