'use client';

import { useESP32 } from '@/hooks/useESP32';
import { useESP32Connection } from '@/hooks/useESP32Connection';
import type { Pattern } from '@/types/esp32.types';

const PATTERNS: { name: string; value: Pattern; icon: string }[] = [
    { name: 'Dalga', value: 'wave', icon: '🌊' },
    { name: 'Spiral', value: 'spiral', icon: '🌀' },
    { name: 'Satranç', value: 'checkerboard', icon: '🏁' },
    { name: 'Yatay', value: 'horizontal', icon: '↔️' },
    { name: 'Dikey', value: 'vertical', icon: '↕️' },
    { name: 'Çapraz', value: 'diagonal', icon: '↘️' },
    { name: 'Hepsini Kaldır', value: 'raiseall', icon: '⬆️' },
    { name: 'Hepsini İndir', value: 'lowerall', icon: '⬇️' }
];

export function PatternLibrary() {
    const { isConnected } = useESP32Connection();
    const { runPattern } = useESP32();

    const handlePattern = async (pattern: Pattern) => {
        try {
            await runPattern(pattern);
            console.log(`✅ Pattern çalıştırıldı: ${pattern}`);
        } catch (error) {
            console.error(`❌ Pattern hatası:`, error);
        }
    };

    return (
        <div className="space-y-4">
            <h2 className="text-xl font-bold">Animasyonlar</h2>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {PATTERNS.map(({ name, value, icon }) => (
                    <button
                        key={value}
                        onClick={() => handlePattern(value)}
                        disabled={!isConnected}
                        className="flex flex-col items-center gap-1 p-3 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                        <span className="text-2xl">{icon}</span>
                        <span className="text-xs">{name}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}