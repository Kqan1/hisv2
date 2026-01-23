'use client';

import { useSyncExternalStore, useEffect } from 'react';
import { getESP32Service } from '@/services/esp32.service';

export function useESP32Connection() {
  const service = getESP32Service();

  const state = useSyncExternalStore(
    service.subscribe.bind(service),
    service.getSnapshot,
    service.getServerSnapshot
  );

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        service.startMonitoring();
      } else {
        service.stopMonitoring();
      }
    };

    if (document.visibilityState === 'visible') {
      service.startMonitoring();
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      service.stopMonitoring();
    };
  }, [service]);

  return {
    state,
    isConnected: state === 'connected',
    isChecking: state === 'checking',
    isDisconnected: state === 'disconnected'
  };
}
