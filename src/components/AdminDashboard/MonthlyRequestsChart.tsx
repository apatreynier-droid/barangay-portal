import { useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import type { AdminMonthlyDataPoint } from "../../Types/AdminDashboardType";

type MonthlyRequestsChartProps = {
  data: AdminMonthlyDataPoint[];
};

const WIDTH = 720;
const HEIGHT = 300;
const PADDING_LEFT = 44;
const PADDING_RIGHT = 16;
const PADDING_TOP = 16;
const PADDING_BOTTOM = 34;
const BAR_WIDTH = 14;
const BAR_GAP = 5;
const GRID_INTERVALS = 4;

// Whole-number Y-axis intervals: the axis picks the smallest "nice" step
// (1, 2, 5, 10, 15, 20, …) that keeps every gridline label an integer, e.g.
// 0, 5, 10, 15, 20 for a peak of 12. Decimal labels are never produced.
const NICE_STEPS = [1, 2, 5, 10, 15, 20, 25, 50, 100, 150, 200, 250, 500, 1000];

// Entrance animation settings (Recharts-equivalent):
// isAnimationActive={true}
// animationDuration={1500}
// animationEasing="ease-out"
const ANIMATION_DURATION = 1500;
const ANIMATION_EASING = "ease-out";

const SERIES = [
  { key: "submitted", label: "Submitted", color: "#2563eb" },
  { key: "completed", label: "Completed", color: "#059669" },
  { key: "rejected", label: "Rejected", color: "#f59e0b" },
] as const;

type HoverState = { monthIndex: number; seriesIndex: number };
type TooltipPosition = { x: number; y: number };

// Keeps the hover tooltip inside the panel when the cursor is near its edges.
const TOOLTIP_OFFSET = 14;
const TOOLTIP_MAX_WIDTH = 230;
const TOOLTIP_MAX_HEIGHT = 120;

const MonthlyRequestsChart = ({ data }: MonthlyRequestsChartProps) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [hover, setHover] = useState<HoverState | null>(null);
  const [tooltipPosition, setTooltipPosition] =
    useState<TooltipPosition | null>(null);

  const maxValue = Math.max(
    1,
    ...data.map((point) =>
      Math.max(point.submitted, point.completed, point.rejected),
    ),
  );

  const minStep = Math.max(1, Math.ceil(maxValue / GRID_INTERVALS));
  const valueStep = NICE_STEPS.find((step) => step >= minStep) ?? minStep;
  const topValue = valueStep * GRID_INTERVALS;
  const plotWidth = WIDTH - PADDING_LEFT - PADDING_RIGHT;
  const plotHeight = HEIGHT - PADDING_TOP - PADDING_BOTTOM;
  const groupWidth = BAR_WIDTH * SERIES.length + BAR_GAP * (SERIES.length - 1);
  const slot = plotWidth / Math.max(1, data.length);

  const valueToY = (value: number): number =>
    PADDING_TOP + plotHeight - (value / topValue) * plotHeight;

  const baselineY = PADDING_TOP + plotHeight;

  // Recharts-style hover: track the cursor across the plot area, resolve the
  // active month group + nearest bar, and follow the cursor with a tooltip.
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

    // Convert cursor position from screen pixels into SVG viewBox units.
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
      Math.max(0, Math.round((x - groupX - BAR_WIDTH / 2) / (BAR_WIDTH + BAR_GAP))),
    );

    const wrapperBounds = wrapper.getBoundingClientRect();
    setTooltipPosition({
      x: event.clientX - wrapperBounds.left,
      y: event.clientY - wrapperBounds.top,
    });
    setHover({ monthIndex, seriesIndex });
  };

  const handleMouseLeave = () => {
    setHover(null);
    setTooltipPosition(null);
  };

  // Entrance animation: bars grow upward from the baseline once the real
  // chart data has loaded. The parent only mounts this component after the
  // dashboard fetch resolves, so mounting here means the data is ready.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) {
      return;
    }

    const bars = Array.from(
      svg.querySelectorAll<SVGRectElement>("rect.admin-chart-bar"),
    );

    const animations = bars.map((bar) => {
      const x = Number(bar.getAttribute("x") ?? 0);

      // Pin the scale origin to the bar's own baseline point so each bar
      // stretches upward from y = 0 instead of shrinking toward its center.
      bar.style.transformOrigin = `${x + BAR_WIDTH / 2}px ${baselineY}px`;

      return bar.animate(
        { transform: ["scaleY(0)", "scaleY(1)"] },
        {
          duration: ANIMATION_DURATION,
          easing: ANIMATION_EASING,
          fill: "both",
        },
      );
    });

    return () => {
      animations.forEach((animation) => animation.cancel());
    };
  }, [data, baselineY]);

  const hoveredPoint = hover ? data[hover.monthIndex] : undefined;

  const wrapperWidth = wrapperRef.current?.clientWidth ?? 0;
  const wrapperHeight = wrapperRef.current?.clientHeight ?? 0;
  const tooltipLeft = tooltipPosition
    ? Math.min(
        tooltipPosition.x + TOOLTIP_OFFSET,
        Math.max(0, wrapperWidth - TOOLTIP_MAX_WIDTH),
      )
    : 0;
  const tooltipTop = tooltipPosition
    ? Math.min(
        tooltipPosition.y + TOOLTIP_OFFSET,
        Math.max(0, wrapperHeight - TOOLTIP_MAX_HEIGHT),
      )
    : 0;

  return (
    <section className="admin-panel admin-chart-panel">
      <h3 className="admin-panel-title">Monthly Requests Overview</h3>

      <div className="admin-bar-chart-wrapper" ref={wrapperRef}>
        <svg
          ref={svgRef}
          className="admin-bar-chart"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label="Monthly requests overview chart"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {Array.from({ length: GRID_INTERVALS + 1 }, (_, index) => {
            const value = valueStep * index;
            const y = valueToY(value);

            return (
              <g key={`grid-${index}`}>
                <line
                  x1={PADDING_LEFT}
                  x2={WIDTH - PADDING_RIGHT}
                  y1={y}
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
              <g key={point.month + index}>
                {SERIES.map((series, seriesIndex) => {
                  const value = point[series.key];
                  const y = valueToY(value);
                  const x =
                    groupX + seriesIndex * (BAR_WIDTH + BAR_GAP);
                  const isActive =
                    hover !== null &&
                    hover.monthIndex === index &&
                    hover.seriesIndex === seriesIndex;

                  return (
                    <rect
                      key={series.key}
                      className={`admin-chart-bar${isActive ? " is-active" : ""}`}
                      x={x}
                      y={y}
                      width={BAR_WIDTH}
                      height={Math.max(0, PADDING_TOP + plotHeight - y)}
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
                  hover.seriesIndex === seriesIndex
                    ? " is-active"
                    : ""
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
                  {hoveredPoint[series.key]}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default MonthlyRequestsChart;
