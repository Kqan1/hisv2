"use client";
import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Eraser, PencilLine, Trash2 } from 'lucide-react';

interface MatrixProps {
    initialData?: number[][];
    onChange?: (grid: number[][]) => void;
    rows?: number;
    cols?: number;
    disabled?: boolean;
};

export default function Matrix({
    initialData,
    onChange,
    rows = 10,
    cols = 15,
    disabled = false,
}: MatrixProps) {
    const [grid, setGrid] = useState<number[][]>(() =>
        initialData || Array(rows).fill(0).map(() => Array(cols).fill(0))
    );
    const [tool, setTool] = useState<'pencil' | 'eraser'>('pencil');
    const [isDrawing, setIsDrawing] = useState(false);
    const lastPos = useRef<{ x: number; y: number } | null>(null);

    useEffect(() => {
        if (initialData) setGrid(initialData);
    }, [initialData]);

    const drawLine = (x0: number, y0: number, x1: number, y1: number, currentGrid: number[][]) => {
        const newGrid = currentGrid.map((row) => [...row]);
        const dx = Math.abs(x1 - x0);
        const dy = Math.abs(y1 - y0);
        const sx = x0 < x1 ? 1 : -1;
        const sy = y0 < y1 ? 1 : -1;
        let err = dx - dy;

        while (true) {
            if (y0 >= 0 && y0 < rows && x0 >= 0 && x0 < cols) {
                newGrid[y0][x0] = tool === 'pencil' ? 1 : 0;
            }
            if (x0 === x1 && y0 === y1) break;
                const e2 = 2 * err;
            if (e2 > -dy) { err -= dy; x0 += sx; }
            if (e2 < dx) { err += dx; y0 += sy; }
        }
        return newGrid;
    };

    const handleUpdate = (x: number, y: number) => {
        if (disabled) return;
            setGrid((prev) => {
                let nextGrid;
                if (lastPos.current) {
                    nextGrid = drawLine(lastPos.current.x, lastPos.current.y, x, y, prev);
                } else {
                    nextGrid = prev.map((row) => [...row]);
                    nextGrid[y][x] = tool === 'pencil' ? 1 : 0;
                }
                onChange?.(nextGrid);
                return nextGrid;
            });
        lastPos.current = { x, y };
    };

    const handleReset = () => {
        const emptyGrid = Array(rows).fill(0).map(() => Array(cols).fill(0));
        setGrid(emptyGrid);
        onChange?.(emptyGrid);
    };

    return (
        <div 
            className="flex flex-col items-center gap-2"
            onMouseUp={() => { setIsDrawing(false); lastPos.current = null; }}
            onMouseLeave={() => { setIsDrawing(false); lastPos.current = null; }}
        >
            <div className="flex items-center gap-2 w-full justify-between">
                <ToggleGroup type="single" value={tool} onValueChange={(v) => v && setTool(v as any)} disabled={disabled}>
                    <ToggleGroupItem value="pencil" className="gap-2"><PencilLine size={16} />Draw</ToggleGroupItem>
                    <ToggleGroupItem value="eraser" className="gap-2"><Eraser size={16} /> Erase</ToggleGroupItem>
                </ToggleGroup>
                <Separator orientation="vertical" className="h-8" />
                <Button variant="destructive" size="sm" onClick={handleReset} disabled={disabled} className="gap-2">
                    <Trash2 size={16} /> Clear
                </Button>
            </div>

            <div 
                className="grid gap-px bg-zinc-200 border border-zinc-200 select-none touch-none size-full"
                style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
            >
                {grid.map((row, y) => row.map((cell, x) => (
                    <div
                        key={`${x}-${y}`}
                        className={`aspect-square size-full ${cell === 1 ? 'bg-black' : 'bg-white'} transition-colors duration-75`}
                        onMouseDown={() => { setIsDrawing(true); handleUpdate(x, y); }}
                        onMouseEnter={() => isDrawing && handleUpdate(x, y)}
                    />
                )))}
            </div>
        </div>
    );
};