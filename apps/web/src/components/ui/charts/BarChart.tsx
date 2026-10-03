/**
 * SVG bar chart with labels, units, and empty state.
 */

interface BarDataItem {
  label: string;
  value: number | null;
  color?: string;
}

interface BarChartProps {
  data: BarDataItem[];
  title?: string;
  unit?: string;
  height?: number;
  className?: string;
}

export function BarChart({ data, title, unit = "", height = 200, className = "" }: BarChartProps) {
  const padding = { top: 20, right: 12, bottom: 40, left: 50 };
  const chartW = 600 - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  if (data.length === 0) {
    return (
      <div className={`glass-panel flex items-center justify-center ${className}`} style={{ minHeight: height }}>
        <p className="font-mono text-xs text-graphite-500">No data available</p>
      </div>
    );
  }

  const validData = data.filter((d) => d.value !== null);
  const maxVal = validData.length > 0 ? Math.max(...validData.map((d) => d.value!)) : 0;
  const barWidth = Math.min(40, (chartW / data.length) * 0.7);
  const gap = (chartW - barWidth * data.length) / (data.length + 1);

  return (
    <div className={`glass-panel p-3 ${className}`}>
      {title && (
        <div className="mb-2 flex items-center justify-between">
          <p className="font-mono text-[10px] uppercase tracking-wider text-graphite-500">{title}</p>
          {unit && <span className="font-mono text-[10px] text-graphite-600">{unit}</span>}
        </div>
      )}
      <svg viewBox={`0 0 600 ${height}`} className="w-full" preserveAspectRatio="xMidYMid meet">
        {/* Bars */}
        {data.map((d, i) => {
          const x = padding.left + gap + i * (barWidth + gap);
          const val = d.value ?? 0;
          const barH = maxVal > 0 ? (val / maxVal) * chartH : 0;
          const y = padding.top + chartH - barH;

          return (
            <g key={i}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barH}
                fill={d.color ?? "#4fc3f7"}
                opacity="0.7"
                rx="1"
              />
              {/* Value label */}
              {d.value !== null && (
                <text
                  x={x + barWidth / 2}
                  y={y - 4}
                  textAnchor="middle"
                  className="fill-graphite-400 font-mono"
                  fontSize="8"
                >
                  {d.value.toFixed(d.value % 1 === 0 ? 0 : 1)}
                </text>
              )}
              {/* X label */}
              <text
                x={x + barWidth / 2}
                y={height - 8}
                textAnchor="middle"
                className="fill-graphite-600 font-mono"
                fontSize="7"
                transform={`rotate(-30, ${x + barWidth / 2}, ${height - 8})`}
              >
                {d.label.length > 12 ? d.label.slice(0, 12) + "…" : d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
