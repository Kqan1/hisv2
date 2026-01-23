'use client';

import { useESP32 } from '@/hooks/useESP32';
import { useESP32Connection } from '@/hooks/useESP32Connection';
import { useState } from 'react';

export function ControlPanel() {
    const { isConnected } = useESP32Connection();
    const { clear, stop, enableLoop } = useESP32();
    const [loading, setLoading] = useState(false);

    const handleAction = async (action: () => Promise<void>, name: string) => {
        if (!isConnected) return;
    
        setLoading(true);
        try {
            await action();
            console.log(`✅ ${name} başarılı`);
        } catch (error) {
            console.error(`❌ ${name} hatası:`, error);
        } finally {
            setLoading(false);
        }
};

    return (
        <div className="space-y-4">
            <h2 className="text-xl font-bold">Kontrol Paneli</h2>
        
            <div className="flex flex-wrap gap-2">
                <button
                    onClick={() => handleAction(clear, 'Clear')}
                    disabled={!isConnected || loading}
                    className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                    Temizle
                </button>

                <button
                    onClick={() => handleAction(stop, 'Stop')}
                    disabled={!isConnected || loading}
                    className="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                    Durdur
                </button>

                <button
                    onClick={() => handleAction(() => enableLoop(true), 'Enable Loop')}
                    disabled={!isConnected || loading}
                    className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                    Loop Aktif
                </button>
            </div>
        
            {loading && (
                <div className="text-sm text-gray-600">İşlem yapılıyor...</div>
            )}
        </div>
    );
};