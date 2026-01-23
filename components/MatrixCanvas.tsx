'use client';

import { useESP32 } from '@/hooks/useESP32';
import { useESP32Connection } from '@/hooks/useESP32Connection';
import { useState } from 'react';

export function MatrixCanvas() {
    const { isConnected } = useESP32Connection();
    const { setArray } = useESP32();
    const [grid, setGrid] = useState<boolean[][]>(
        Array(10).fill(0).map(() => Array(15).fill(false))
    );

    const handlePixelClick = (row: number, col: number) => {
        setGrid(prev => {
            const newGrid = prev.map(r => [...r]);
            newGrid[row][col] = !newGrid[row][col];
            return newGrid;
        });
    };

    const handleSend = async () => {
        const matrix = grid.map(row => row.map(pixel => pixel ? 1 : 0));
        
        try {
            await setArray(matrix, {
                cycle: true,
                holdTime: 150,
                offTime: 30
        });
            console.log('✅ Matrix gönderildi');
        } catch (error) {
            console.error('❌ Matrix gönderme hatası:', error);
        }
    };

    const handleClear = () => {
        setGrid(Array(10).fill(0).map(() => Array(15).fill(false)));
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold">Çizim Tuvali</h2>
                <div className="flex gap-2">
                    <button
                        onClick={handleClear}
                        className="px-3 py-1 text-sm bg-gray-500 text-white rounded hover:bg-gray-600"
                    >
                        Temizle
                    </button>
                    <button
                        onClick={handleSend}
                        disabled={!isConnected}
                        className="px-3 py-1 text-sm bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
                    >
                        Gönder
                    </button>
                </div>
            </div>

            <div className="inline-grid gap-1" style={{ gridTemplateColumns: 'repeat(15, 1fr)' }}>
                {grid.map((row, rowIdx) =>
                    row.map((pixel, colIdx) => (
                        <button
                            key={`${rowIdx}-${colIdx}`}
                            onClick={() => handlePixelClick(rowIdx, colIdx)}
                            className={`w-8 h-8 border transition-colors ${
                                pixel ? 'bg-blue-500' : 'bg-gray-200'
                            } hover:opacity-80`}
                        />
                    ))
                )}
            </div>
        </div>
    );
}