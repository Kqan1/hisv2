'use client';

import { useSyncExternalStore } from 'react';
import { getESP32Service } from '@/services/esp32.service';

export function useESP32Connection() {
  const service = getESP32Service();

  const state = useSyncExternalStore(
    service.subscribe.bind(service),
    service.getSnapshot,
    service.getServerSnapshot
  );

  return {
    state,
    isConnected: state === 'connected',
    isChecking: state === 'checking',
    isDisconnected: state === 'disconnected'
  };
}
