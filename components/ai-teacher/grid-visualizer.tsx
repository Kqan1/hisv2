'use client';

interface GridVisualizerProps {
    matrix: number[];
    rows: number;
    cols: number;
}

export const GridVisualizer = ({ matrix, rows, cols }: GridVisualizerProps) => {
    // Determine the grid columns for CSS
    const gridStyle = {
        gridTemplateColumns: `repeat(${cols}, 24px)`,
    };

    return (
        <div className="border border-border rounded-lg p-4 bg-card w-fit">
            <div className="grid gap-1" style={gridStyle}>
                {matrix.map((cell, i) => (
                    <div
                        key={i}
                        className={`w-6 h-6 border rounded-sm transition-colors duration-200 ${
                            cell === 1 
                                ? 'bg-primary border-primary' 
                                : 'bg-muted/30 border-border'
                        }`}
                    />
                ))}
            </div>
            <div className="mt-2 text-xs text-muted-foreground text-center">
                {rows}x{cols} Grid
            </div>
        </div>
    );
};
