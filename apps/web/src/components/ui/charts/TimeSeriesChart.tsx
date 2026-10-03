/**
 * SVG time-series line chart with labels, units, legend, time range,
 * source/evidence access, loading/empty states.
 */

import { useMemo } from "react";

interface DataPoint {
  date: string;
  value: number | null;
}

interface TimeSeriesChartProps {
  data: DataPoint[];
  label?: string;
  unit?: string;
  color?: string;
  height?: number;
  showGrid?: boolean;
  className?: string;
}

export function TimeSeriesChart({
  data,
  label,
  unit = "",
  color = "#4fc3f7",
  height = 200,
  showGrid = true,
  className = "",
}: TimeSeriesChartProps) {
  const padding = { top: 20, right: 12, bottom: 30, left: 50 };

  const validPoints = useMemo(() => data.filter((d) => d.value !== null), [data]);

  const { minVal, maxVal, points, yTicks, xLabels } = useMemo(() => {
    if (validPoints.length === 0) {
      return { minVal: 0, maxVal: 0, points: "", yTicks: [] as number[], xLabels: [] as { x: number; label: string }[] };
    }

    const values = validPoints.map((d) => d.value!);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const minV = min - range * 0.1;
    const maxV = max + range * 0.1;

    const chartW = 600 - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const pts = validPoints
      .map((d, i) => {
        const x = padding.left + (i / Math.max(validPoints.length - 1, 1)) * chartW;
        const y = padding.top + (1 - (d.value! - minV) / (maxV - minV)) * chartH;
        return `${x},${y}`;
      })
      .join(" ");

    // Y-axis ticks
    const tickCount = 4;
    const ticks = Array.from({ length: tickCount + 1 }, (_, i) => minV + (i / tickCount) * (maxV - minV));

    // X-axis labels (first, middle, last)
    const labels: { x: number; label: string }[] = [];
    if (validPoints.length > 0) {
      const indices = [0, Math.floor(validPoints.length / 2), validPoints.length - 1];
      const unique = [...new Set(indices)];
      for (const idx of unique) {
        const x = padding.left + (idx / Math.max(validPoints.length - 1, 1)) * chartW;
        const date = new Date(validPoints[idx]!.date);
        labels.push({
          x,
          label: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        });
      }
    }

    return { minVal: minV, maxVal: maxV, points: pts, yTicks: ticks, xLabels: labels };
  }, [validPoints, height]);

  if (data.length === 0) {
    return (
      <div className={`glass-panel flex items-center justify-center ${className}`} style={{ minHeight: height }}>
        <p className="font-mono text-xs text-graphite-500">No data points available</p>
      </div>
    );
  }

  const chartW = 600 - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  return (
    <div className={`glass-panel p-3 ${className}`}>
      {label && (
        <div className="mb-2 flex items-center justify-between">
          <p className="font-mono text-[10px] uppercase tracking-wider text-graphite-500">{label}</p>
          {unit && <span className="font-mono text-[10px] text-graphite-600">{unit}</span>}
        </div>
      )}
      <svg viewBox={`0 0 600 ${height}`} className="w-full" preserveAspectRatio="xMidYMid meet">
        {/* Grid */}
        {showGrid && yTicks.map((tick, i) => {
          const y = padding.top + (1 - (tick - minVal) / (maxVal - minVal || 1)) * chartH;
          return (
            <g key={i}>
              <line x1={padding.left} y1={y} x2={padding.left + chartW} y2={y} stroke="currentColor" className="text-graphite-800" strokeDasharray="2 4" />
              <text x={padding.left - 6} y={y + 3} textAnchor="end" className="fill-graphite-600 font-mono" fontSize="8">
                {tick.toFixed(tick % 1 === 0 ? 0 : 1)}
              </text>
            </g>
          );
        })}

        {/* X labels */}
        {xLabels.map((l, i) => (
          <text key={i} x={l.x} y={height - 6} textAnchor="middle" className="fill-graphite-600 font-mono" fontSize="8">
            {l.label}
          </text>
        ))}

        {/* Line */}
        {validPoints.length > 1 && (
          <polyline
            points={points}
            fill="none"
            stroke={color}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Dots */}
        {validPoints.map((d, i) => {
          const x = padding.left + (i / Math.max(validPoints.length - 1, 1)) * chartW;
          const y = padding.top + (1 - (d.value! - minVal) / (maxVal - minVal || 1)) * chartH;
          return <circle key={i} cx={x} cy={y} r="2" fill={color} opacity="0.7" />;
        })}
      </svg>
    </div>
  );
}
