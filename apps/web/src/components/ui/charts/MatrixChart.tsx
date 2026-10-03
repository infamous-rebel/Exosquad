/**
 * Demand × Competition quadrant matrix chart.
 * Data-driven positioning with labels.
 */

interface MatrixPoint {
  id: string;
  label: string;
  demand: number; // x-axis: demand score
  competition: number; // y-axis: competition intensity
  size?: number; // bubble size
  color?: string;
}

interface MatrixChartProps {
  points: MatrixPoint[];
  xLabel?: string;
  yLabel?: string;
  height?: number;
  className?: string;
}

export function MatrixChart({
  points,
  xLabel = "DEMAND",
  yLabel = "COMPETITION",
  height = 300,
  className = "",
}: MatrixChartProps) {
  const padding = { top: 20, right: 20, bottom: 30, left: 40 };
  const chartW = 400 - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  if (points.length === 0) {
    return (
      <div className={`glass-panel flex items-center justify-center ${className}`} style={{ minHeight: height }}>
        <p className="font-mono text-xs text-graphite-500">No data points to plot</p>
      </div>
    );
  }

  const maxDemand = Math.max(...points.map((p) => p.demand), 1);
  const maxCompetition = Math.max(...points.map((p) => p.competition), 1);

  return (
    <div className={`glass-panel p-3 ${className}`}>
      <svg viewBox={`0 0 400 ${height}`} className="w-full" preserveAspectRatio="xMidYMid meet">
        {/* Quadrant lines */}
        <line
          x1={padding.left + chartW / 2}
          y1={padding.top}
          x2={padding.left + chartW / 2}
          y2={padding.top + chartH}
          stroke="currentColor"
          className="text-graphite-800"
          strokeDasharray="4 4"
        />
        <line
          x1={padding.left}
          y1={padding.top + chartH / 2}
          x2={padding.left + chartW}
          y2={padding.top + chartH / 2}
          stroke="currentColor"
          className="text-graphite-800"
          strokeDasharray="4 4"
        />

        {/* Quadrant labels */}
        <text x={padding.left + chartW * 0.25} y={padding.top + 12} textAnchor="middle" className="fill-graphite-700 font-mono" fontSize="7">
          LOW DEM / HIGH COMP
        </text>
        <text x={padding.left + chartW * 0.75} y={padding.top + 12} textAnchor="middle" className="fill-graphite-700 font-mono" fontSize="7">
          HIGH DEM / HIGH COMP
        </text>
        <text x={padding.left + chartW * 0.25} y={padding.top + chartH - 4} textAnchor="middle" className="fill-graphite-700 font-mono" fontSize="7">
          LOW DEM / LOW COMP
        </text>
        <text x={padding.left + chartW * 0.75} y={padding.top + chartH - 4} textAnchor="middle" className="fill-graphite-700 font-mono" fontSize="7">
          HIGH DEM / LOW COMP
        </text>

        {/* Points */}
        {points.map((p) => {
          const x = padding.left + (p.demand / maxDemand) * chartW;
          const y = padding.top + (1 - p.competition / maxCompetition) * chartH;
          const r = p.size ?? 4;

          return (
            <g key={p.id}>
              <circle cx={x} cy={y} r={r} fill={p.color ?? "#4fc3f7"} opacity="0.7" />
              <text x={x} y={y - r - 3} textAnchor="middle" className="fill-graphite-400 font-mono" fontSize="7">
                {p.label.length > 15 ? p.label.slice(0, 15) + "…" : p.label}
              </text>
            </g>
          );
        })}

        {/* Axis labels */}
        <text x={padding.left + chartW / 2} y={height - 4} textAnchor="middle" className="fill-graphite-500 font-mono" fontSize="8">
          {xLabel}
        </text>
        <text
          x={8}
          y={padding.top + chartH / 2}
          textAnchor="middle"
          className="fill-graphite-500 font-mono"
          fontSize="8"
          transform={`rotate(-90, 8, ${padding.top + chartH / 2})`}
        >
          {yLabel}
        </text>
      </svg>
    </div>
  );
}
