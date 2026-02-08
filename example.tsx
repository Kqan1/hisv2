'use client';

const data = {
    "matrix": [
      0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0,
      1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    ],
    "rows": 10,
    "cols": 15,
    "message": "Excellent idea. To see the parabola as a graph, we need a frame of reference. I have added a horizontal line at the bottom—that is the X-axis. I also added a vertical line down the center—that is the Y-axis. The parabola sits exactly where they cross, at the 'origin.' Start at that intersection point. Can you feel how the curve rises and widens symmetrically on both sides of the vertical line, like a flower opening up?"
  }

function reshape(matrix: number[], rows: number, cols: number): number[][] {
  const out: number[][] = [];

  for (let r = 0; r < rows; r++) {
    out.push(matrix.slice(r * cols, (r + 1) * cols));
  }

  return out;
}

export default function Page() {
  const grid = reshape(data.matrix, data.rows, data.cols);

  console.log(grid)

  return (
    <main className="p-8 space-y-6">
      <p className="text-lg">{data.message}</p>

      <div
        className="grid gap-1"
        style={{
          gridTemplateColumns: `repeat(${data.cols}, 24px)`
        }}
      >
        {grid.flat().map((cell, i) => (
          <div
            key={i}
            className={`w-6 h-6 border ${
              cell === 1 ? 'bg-black' : 'bg-gray-100'
            }`}
          />
        ))}
      </div>
    </main>
  );
}
