/**
 * Donut chart for landed cost component breakdown.
 */

interface CostComponent {
  label: string;
  value: number;
  color?: string;
}

interface CostBreakdownProps {
  components: CostComponent[];
  totalLabel?: string;
  currency?: string;
  height?: number;
  className?: string;
}

const DEFAULT_COLORS = ["#4fc3f7", "#81d4fa", "#b3e5fc", "#e1f5fe", "#29b6f6", "#03a9f4", "#0288d1", "#0277bd"];

export function CostBreakdown({
  components,
  totalLabel = "TOTAL",
  currency = "USD",
  height = 200,
  className = "",
}: CostBreakdownProps) {
  if (components.length === 0) {
    return (
      <div className={`glass-panel flex items-center justify-center ${className}`} style={{ minHeight: height }}>
        <p className="font-mono text-xs text-graphite-500">No cost data available</p>
      </div>
    );
  }

  const total = components.reduce((sum, c) => sum + c.value, 0);
  const size = height;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 10;
  const innerR = outerR * 0.6;

  let cumulative = 0;
  const arcs = components.map((c, i) => {
    const fraction = total > 0 ? c.value / total : 0;
    const startAngle = cumulative * 2 * Math.PI - Math.PI / 2;
    cumulative += fraction;
    const endAngle = cumulative * 2 * Math.PI - Math.PI / 2;

    const largeArc = fraction > 0.5 ? 1 : 0;
    const x1o = cx + outerR * Math.cos(startAngle);
    const y1o = cy + outerR * Math.sin(startAngle);
    const x2o = cx + outerR * Math.cos(endAngle);
    const y2o = cy + outerR * Math.sin(endAngle);
    const x1i = cx + innerR * Math.cos(endAngle);
    const y1i = cy + innerR * Math.sin(endAngle);
    const x2i = cx + innerR * Math.cos(startAngle);
    const y2i = cy + innerR * Math.sin(startAngle);

    const d = `M ${x1o} ${y1o} A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2o} ${y2o} L ${x1i} ${y1i} A ${innerR} ${innerR} 0 ${largeArc} 0 ${x2i} ${y2i} Z`;

    return {
      d,
      color: c.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length],
      label: c.label,
      value: c.value,
      fraction,
    };
  });

  return (
    <div className={`glass-panel p-3 ${className}`}>
      <div className="flex items-center gap-4">
        {/* Donut */}
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
          {arcs.map((arc, i) => (
            <path key={i} d={arc.d} fill={arc.color} opacity="0.8" />
          ))}
          {/* Center text */}
          <text x={cx} y={cy - 6} textAnchor="middle" className="fill-graphite-500 font-mono" fontSize="8">
            {totalLabel}
          </text>
          <text x={cx} y={cy + 8} textAnchor="middle" className="fill-graphite-100 font-mono" fontSize="12" fontWeight="bold">
            {total.toFixed(2)}
          </text>
          <text x={cx} y={cy + 20} textAnchor="middle" className="fill-graphite-500 font-mono" fontSize="7">
            {currency}
          </text>
        </svg>

        {/* Legend */}
        <div className="flex-1 space-y-1.5">
          {arcs.map((arc, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: arc.color }} />
              <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-graphite-400">{arc.label}</span>
              <span className="font-mono text-[10px] text-graphite-300">{arc.value.toFixed(2)}</span>
              <span className="font-mono text-[10px] text-graphite-600">{(arc.fraction * 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
