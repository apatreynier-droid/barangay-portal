import { useRef, useState } from "react";
import type { MouseEvent } from "react";
import type { AdminReportsMonthlyPoint } from "../../../Types/Admin/AdminReportsType";

type CompletedRejectedBarChartProps = {
  data: AdminReportsMonthlyPoint[];
};

const WIDTH = 720;
const HEIGHT = 300;
const PADDING_LEFT = 44;
const PADDING_RIGHT = 16;
const PADDING_TOP = 16;
const PADDING_BOTTOM = 34;
const BAR_WIDTH = 18;
const BAR_GAP = 6;
const GRID_INTERVALS = 4;

const SERIES = [
  { key: "completed", label: "Completed", color: "#10b981" },
  { key: "rejected", label: "Rejected", color: "#f59e0b" },
] as const;

type SeriesKey = (typeof SERIES)[number]["key"];

type HoverState = { monthIndex: number; seriesIndex: number };
type TooltipPosition = { x: number; y: number };

const CompletedRejectedBarChart = ({
  data,
}: CompletedRejectedBarChartProps) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [hover, setHover] = useState<HoverState | null>(null);
  const [tooltipPosition, setTooltipPosition] =
    useState<TooltipPosition | null>(null);

  const maxValue = Math.max(
    1,
    ...data.map((point) => Math.max(point.completed, point.rejected)),
  );
  const step = Math.max(1, Math.ceil(maxValue / GRID_INTERVALS));
  const topValue = Math.max(step, Math.ceil(maxValue / step) * step);

  const plotWidth = WIDTH - PADDING_LEFT - PADDING_RIGHT;
  const plotHeight = HEIGHT - PADDING_TOP - PADDING_BOTTOM;
  const groupWidth = BAR_WIDTH * SERIES.length + BAR_GAP * (SERIES.length - 1);
  const slot = plotWidth / Math.max(1, data.length);

  const valueToY = (value: number): number =>
    PADDING_TOP + plotHeight - (value / topValue) * plotHeight;

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
    const y = ((event.clientY - bounds.top) / bounds.height) * HEIGHT;

    const insidePlot =
      x >= PADDING_LEFT &&
      x <= WIDTH - PADDING_RIGHT &&
      y >= PADDING_TOP &&
      y <= PADDING_TOP + plotHeight;

    if (!insidePlot) {
      setHover(null);
      setTooltipPosition(null);
      return;
    }

    const monthIndex = Math.min(
      data.length - 1,
      Math.max(0, Math.floor((x - PADDING_LEFT) / slot)),
    );
    const groupX = PADDING_LEFT + slot * monthIndex + (slot - groupWidth) / 2;
    const seriesIndex = Math.min(
      SERIES.length - 1,
      Math.max(0, Math.floor((x - groupX) / (BAR_WIDTH + BAR_GAP))),
    );

    setHover({ monthIndex, seriesIndex });

    const wrapperBounds = wrapper.getBoundingClientRect();
    setTooltipPosition({
      x: event.clientX - wrapperBounds.left,
      y: event.clientY - wrapperBounds.top,
    });
  };

  const handleMouseLeave = () => {
    setHover(null);
    setTooltipPosition(null);
  };

  const hoveredPoint = hover ? data[hover.monthIndex] : undefined;
  const tooltipLeft = tooltipPosition
    ? Math.min(Math.max(tooltipPosition.x + 14, 8), Math.max(8, WIDTH - 170))
    : 0;
  const tooltipTop = tooltipPosition ? tooltipPosition.y + 14 : 0;

  return (
    <section className="admin-panel reports-panel">
      <h3 className="admin-panel-title">Completed vs Rejected by Month</h3>

      {data.length === 0 ? (
        <p className="reports-chart-empty">No request data available yet.</p>
      ) : (
        <>
          <div className="reports-bar-chart-wrapper" ref={wrapperRef}>
            <svg
              ref={svgRef}
              className="reports-chart"
              viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
              role="img"
              aria-label="Completed vs rejected requests by month"
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
            >
              {/* Horizontal gridlines + y-axis labels */}
              {Array.from({ length: GRID_INTERVALS + 1 }, (_, index) => {
                const value = step * index;
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

              {/* Cursor highlight band behind the hovered month group */}
              <rect
                className={`admin-chart-cursor${hover ? " is-visible" : ""}`}
                x={hover ? PADDING_LEFT + slot * hover.monthIndex : 0}
                y={PADDING_TOP}
                width={slot}
                height={plotHeight}
                rx={6}
              />

              {data.map((point, index) => {
                const groupX =
                  PADDING_LEFT + slot * index + (slot - groupWidth) / 2;

                return (
                  <g key={`${point.month}-${index}`}>
                    {SERIES.map((series, seriesIndex) => {
                      const value = point[series.key as SeriesKey];
                      const barY = valueToY(value);
                      const x = groupX + seriesIndex * (BAR_WIDTH + BAR_GAP);
                      const isActive =
                        hover !== null &&
                        hover.monthIndex === index &&
                        hover.seriesIndex === seriesIndex;

                      return (
                        <rect
                          key={series.key}
                          className={`reports-bar${isActive ? " is-active" : ""}`}
                          x={x}
                          y={barY}
                          width={BAR_WIDTH}
                          height={Math.max(0, PADDING_TOP + plotHeight - barY)}
                          rx={3}
                          fill={series.color}
                          aria-label={`${point.month} — ${series.label}: ${value}`}
                        />
                      );
                    })}

                    <text
                      x={groupX + groupWidth / 2}
                      y={HEIGHT - 10}
                      textAnchor="middle"
                      className="admin-chart-axis-label"
                    >
                      {point.month}
                    </text>
                  </g>
                );
              })}
            </svg>

            {hover && hoveredPoint && tooltipPosition && (
              <div
                className="admin-chart-tooltip"
                style={{ left: tooltipLeft, top: tooltipTop }}
                aria-hidden="true"
              >
                <p className="admin-chart-tooltip-title">
                  {hoveredPoint.month}
                </p>
                {SERIES.map((series, seriesIndex) => (
                  <div
                    key={series.key}
                    className={`admin-chart-tooltip-row${
                      hover.seriesIndex === seriesIndex ? " is-active" : ""
                    }`}
                  >
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

          <ul className="reports-chart-legend reports-chart-legend-center">
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

export default CompletedRejectedBarChart;
