import { useRef, useState } from "react";
import type { MouseEvent } from "react";
import type { AdminReportsMonthlyPoint } from "../../../Types/AdminReportsType";

type MonthlyVolumeLineChartProps = {
  data: AdminReportsMonthlyPoint[];
};

const WIDTH = 720;
const HEIGHT = 280;
const PADDING_LEFT = 40;
const PADDING_RIGHT = 16;
const PADDING_TOP = 20;
const PADDING_BOTTOM = 34;
const GRID_INTERVALS = 4;
const DOT_RADIUS = 4;

const SERIES = [
  { key: "completed", label: "Completed", color: "#10b981" },
  { key: "rejected", label: "Rejected", color: "#ef4444" },
  { key: "requests", label: "Requests", color: "#2563eb" },
] as const;

type SeriesKey = (typeof SERIES)[number]["key"];

const MonthlyVolumeLineChart = ({ data }: MonthlyVolumeLineChartProps) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const maxValue = Math.max(
    1,
    ...data.map((point) =>
      Math.max(point.requests, point.completed, point.rejected),
    ),
  );
  const topValue = Math.max(
    GRID_INTERVALS,
    Math.ceil(maxValue / GRID_INTERVALS) * GRID_INTERVALS,
  );

  const plotWidth = WIDTH - PADDING_LEFT - PADDING_RIGHT;
  const plotHeight = HEIGHT - PADDING_TOP - PADDING_BOTTOM;
  const baselineY = PADDING_TOP + plotHeight;

  const valueToY = (value: number): number =>
    PADDING_TOP + plotHeight - (value / topValue) * plotHeight;

  const monthToX = (index: number): number => {
    if (data.length <= 1) {
      return PADDING_LEFT + plotWidth / 2;
    }

    return PADDING_LEFT + (index / (data.length - 1)) * plotWidth;
  };

  const handleMouseMove = (event: MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    const wrapper = wrapperRef.current;
    if (!svg || !wrapper || data.length === 0) {
      return;
    }

    const bounds = svg.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) {
      return;
    }

    const x = ((event.clientX - bounds.left) / bounds.width) * WIDTH;
    const rawIndex =
      data.length <= 1
        ? 0
        : Math.round(((x - PADDING_LEFT) / plotWidth) * (data.length - 1));
    setHoveredIndex(Math.min(data.length - 1, Math.max(0, rawIndex)));

    const wrapperBounds = wrapper.getBoundingClientRect();
    setTooltipPosition({
      x: event.clientX - wrapperBounds.left,
      y: event.clientY - wrapperBounds.top,
    });
  };

  const handleMouseLeave = () => {
    setHoveredIndex(null);
    setTooltipPosition(null);
  };

  const hoveredPoint = hoveredIndex !== null ? data[hoveredIndex] : undefined;
  const tooltipLeft = tooltipPosition
    ? Math.min(Math.max(tooltipPosition.x + 14, 8), Math.max(8, WIDTH - 170))
    : 0;
  const tooltipTop = tooltipPosition ? tooltipPosition.y + 14 : 0;

  return (
    <section className="admin-panel reports-panel">
      <h3 className="admin-panel-title">Monthly Request Volume</h3>

      {data.length === 0 ? (
        <p className="reports-chart-empty">No request data available yet.</p>
      ) : (
        <>
          <div className="reports-line-chart-wrapper" ref={wrapperRef}>
            <svg
              ref={svgRef}
              className="reports-chart"
              viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
              role="img"
              aria-label="Monthly request volume"
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
            >
              {/* Horizontal gridlines + y-axis labels */}
              {Array.from({ length: GRID_INTERVALS + 1 }, (_, index) => {
                const value = (topValue / GRID_INTERVALS) * index;
                const y = valueToY(value);

                return (
                  <g key={`grid-${index}`}>
                    <line
                      x1={PADDING_LEFT}
                      y1={y}
                      x2={WIDTH - PADDING_RIGHT}
                      y2={y}
                      className="admin-chart-gridline"
                    />
                    <text
                      x={PADDING_LEFT - 10}
                      y={y + 4}
                      textAnchor="end"
                      className="admin-chart-axis-label"
                    >
                      {value}
                    </text>
                  </g>
                );
              })}

              {/* Vertical cursor line for the hovered month */}
              {hoveredIndex !== null && (
                <line
                  x1={monthToX(hoveredIndex)}
                  y1={PADDING_TOP}
                  x2={monthToX(hoveredIndex)}
                  y2={baselineY}
                  className="reports-line-cursor"
                />
              )}

              {/* Series lines + dots */}
              {SERIES.map((series) => {
                const points = data
                  .map(
                    (point, index) =>
                      `${monthToX(index)},${valueToY(point[series.key as SeriesKey])}`,
                  )
                  .join(" ");

                return (
                  <g key={series.key}>
                    <polyline
                      points={points}
                      fill="none"
                      stroke={series.color}
                      strokeWidth={2}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />

                    {data.map((point, index) => (
                      <circle
                        key={`${series.key}-${index}`}
                        cx={monthToX(index)}
                        cy={valueToY(point[series.key as SeriesKey])}
                        r={hoveredIndex === index ? DOT_RADIUS + 1.5 : DOT_RADIUS}
                        fill="#ffffff"
                        stroke={series.color}
                        strokeWidth={2}
                      />
                    ))}
                  </g>
                );
              })}

              {/* X-axis month labels */}
              {data.map((point, index) => (
                <text
                  key={`label-${point.month}-${index}`}
                  x={monthToX(index)}
                  y={HEIGHT - 10}
                  textAnchor="middle"
                  className="admin-chart-axis-label"
                >
                  {point.month}
                </text>
              ))}
            </svg>

            {hoveredPoint && tooltipPosition && (
              <div
                className="admin-chart-tooltip"
                style={{ left: tooltipLeft, top: tooltipTop }}
                aria-hidden="true"
              >
                <p className="admin-chart-tooltip-title">{hoveredPoint.month}</p>
                {SERIES.map((series) => (
                  <div key={series.key} className="admin-chart-tooltip-row">
                    <span
                      className="admin-chart-tooltip-dot"
                      style={{ background: series.color }}
                    />
                    <span className="admin-chart-tooltip-label">
                      {series.label}
                    </span>
                    <span className="admin-chart-tooltip-value">
                      {hoveredPoint[series.key as SeriesKey]}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <ul className="reports-chart-legend">
            {SERIES.map((series) => (
              <li key={series.key}>
                <span
                  className="admin-legend-dot"
                  style={{ background: series.color }}
                  aria-hidden="true"
                />
                {series.label}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
};

export default MonthlyVolumeLineChart;
