"use client";
import { useState, useRef, useEffect } from "react";
import { useModel } from "@/components/providers/model-context";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Eraser, PencilLine, Trash2 } from "lucide-react";

interface MatrixProps {
    initialData?: number[][];
    onChange?: (grid: number[][]) => void;
    rows?: number;
    cols?: number;
    disabled?: boolean;
    editable?: boolean;
}

export default function Matrix({
    initialData,
    onChange,
    rows: rowsProp,
    cols: colsProp,
    disabled = false,
    editable = true,
}: MatrixProps) {
    const { activeModel } = useModel();
    const rows = rowsProp ?? activeModel.rows;
    const cols = colsProp ?? activeModel.cols;
    const [grid, setGrid] = useState<number[][]>(
        () =>
            (initialData && initialData.length > 0) ? initialData :
            Array(rows)
                .fill(0)
                .map(() => Array(cols).fill(-1)),
    );
    const gridRef = useRef<number[][]>(grid);
    const [tool, setTool] = useState<"pencil" | "eraser">("pencil");
    const [isDrawing, setIsDrawing] = useState(false);
    const lastPos = useRef<{ x: number; y: number } | null>(null);

    useEffect(() => {
        gridRef.current = grid;
    }, [grid]);

    useEffect(() => {
        if (initialData && initialData.length > 0) {
            setGrid(initialData);
        }
    }, [initialData]);

    const drawLine = (
        x0: number,
        y0: number,
        x1: number,
        y1: number,
        currentGrid: number[][],
    ) => {
        const newGrid = currentGrid.map((row) => [...row]);
        const dx = Math.abs(x1 - x0);
        const dy = Math.abs(y1 - y0);
        const sx = x0 < x1 ? 1 : -1;
        const sy = y0 < y1 ? 1 : -1;
        let err = dx - dy;

        while (true) {
            if (y0 >= 0 && y0 < rows && x0 >= 0 && x0 < cols) {
                newGrid[y0][x0] = tool === "pencil" ? 1 : -1;
            }
            if (x0 === x1 && y0 === y1) break;
            const e2 = 2 * err;
            if (e2 > -dy) {
                err -= dy;
                x0 += sx;
            }
            if (e2 < dx) {
                err += dx;
                y0 += sy;
            }
        }
        return newGrid;
    };

    const handleUpdate = (x: number, y: number) => {
        if (disabled || !editable) return;
        const prev = gridRef.current;
        let nextGrid: number[][];
        if (lastPos.current) {
            nextGrid = drawLine(
                lastPos.current.x,
                lastPos.current.y,
                x,
                y,
                prev,
            );
        } else {
            nextGrid = prev.map((row) => [...row]);
            nextGrid[y][x] = tool === "pencil" ? 1 : -1;
        }
        setGrid(nextGrid);
        onChange?.(nextGrid);
        lastPos.current = { x, y };
    };

    const handleReset = () => {
        if (disabled || !editable) return;
        const emptyGrid = Array(rows)
            .fill(0)
            .map(() => Array(cols).fill(-1));
        setGrid(emptyGrid);
        onChange?.(emptyGrid);
    };

    return (
        <div
            className="flex flex-col items-center gap-2 w-full"
            onMouseUp={() => {
                setIsDrawing(false);
                lastPos.current = null;
            }}
            onMouseLeave={() => {
                setIsDrawing(false);
                lastPos.current = null;
            }}
        >
            {editable && (
                <div className="flex items-center gap-2 w-full justify-between">
                    <ToggleGroup
                        type="single"
                        value={tool}
                        onValueChange={(v) => v && setTool(v as any)}
                        disabled={disabled}
                    >
                        <ToggleGroupItem value="pencil" className="gap-2" aria-label="Draw tool">
                            <PencilLine size={16} />
                            Draw
                        </ToggleGroupItem>
                        <ToggleGroupItem value="eraser" className="gap-2" aria-label="Erase tool">
                            <Eraser size={16} /> Erase
                        </ToggleGroupItem>
                    </ToggleGroup>
                    <Separator orientation="vertical" className="h-8" />
                    <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={handleReset}
                        disabled={disabled}
                        className="gap-2"
                        aria-label="Clear matrix"
                    >
                        <Trash2 size={16} /> Clear
                    </Button>
                </div>
            )}

            <div
                className="grid gap-px bg-zinc-200 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 select-none touch-none w-full"
                style={{
                    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                }}
            >
                {grid.map((row, y) =>
                    row.map((cell, x) => (
                        <div
                            key={`${x}-${y}`}
                            className={`aspect-square w-full ${cell === 1 ? "bg-black dark:bg-zinc-200" : "bg-white dark:bg-black"} transition-colors duration-75`}
                            onMouseDown={() => {
                                if (editable) {
                                    setIsDrawing(true);
                                    handleUpdate(x, y);
                                }
                            }}
                            onMouseEnter={() =>
                                editable && isDrawing && handleUpdate(x, y)
                            }
                        />
                    )),
                )}
            </div>
        </div>
    );
}
