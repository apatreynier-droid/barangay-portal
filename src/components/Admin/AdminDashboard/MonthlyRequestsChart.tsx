import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import type { AdminMonthlyDataPoint } from "../../../Types/Admin/AdminDashboardType";

type MonthlyRequestsChartProps = {
  data: AdminMonthlyDataPoint[];
};

const PADDING_LEFT = 44;
const PADDING_RIGHT = 16;
const PADDING_TOP = 16;
const PADDING_BOTTOM = 34;
const BAR_GAP = 5;
const MAX_BAR_WIDTH = 14;
const MIN_BAR_WIDTH = 5;
const GRID_INTERVALS = 4;

/** Fallback chart width before the wrapper has been measured. */
const DEFAULT_WIDTH = 720;
/** Below this rendered width the chart drops to the latest 6 months. */
const COMPACT_WIDTH = 520;
/** How many recent months the compact (phone) chart shows. */
const COMPACT_MONTHS = 6;

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
  /**
   * The chart renders 1:1 with its container (viewBox width = measured CSS
   * pixels), so axis and month labels stay at a readable 11–12px on phones
   * instead of being shrunk by viewBox scaling. Re-measured on resize.
   */
  const [chartWidth, setChartWidth] = useState(DEFAULT_WIDTH);

  // Layout effect: the first measurement runs before paint so the initial
  // frame is already drawn at the real container width.
  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) {
      return;
    }

    const update = () => {
      const width = Math.round(wrapper.clientWidth);
      if (width > 0) {
        setChartWidth(width);
      }
    };

    update();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(update);
    observer.observe(wrapper);

    return () => {
      observer.disconnect();
    };
  }, []);

  const chartHeight = chartWidth < 420 ? 240 : 300;

  // Phones show the latest six months (the API returns seven) so every bar
  // group and month label keeps enough room to stay readable.
  const visibleData =
    chartWidth < COMPACT_WIDTH && data.length > COMPACT_MONTHS
      ? data.slice(-COMPACT_MONTHS)
      : data;

  const maxValue = Math.max(
    1,
    ...visibleData.map((point) =>
      Math.max(point.submitted, point.completed, point.rejected),
    ),
  );

  const minStep = Math.max(1, Math.ceil(maxValue / GRID_INTERVALS));
  const valueStep = NICE_STEPS.find((step) => step >= minStep) ?? minStep;
  const topValue = valueStep * GRID_INTERVALS;
  const plotWidth = chartWidth - PADDING_LEFT - PADDING_RIGHT;
  const plotHeight = chartHeight - PADDING_TOP - PADDING_BOTTOM;
  const slot = plotWidth / Math.max(1, visibleData.length);
  // Bars shrink with the slot so three series never overlap in a narrow slot.
  const barWidth = Math.max(
    MIN_BAR_WIDTH,
    Math.min(
      MAX_BAR_WIDTH,
      Math.floor((slot * 0.7 - BAR_GAP * (SERIES.length - 1)) / SERIES.length),
    ),
  );
  const groupWidth = barWidth * SERIES.length + BAR_GAP * (SERIES.length - 1);

  const valueToY = (value: number): number =>
    PADDING_TOP + plotHeight - (value / topValue) * plotHeight;

  const baselineY = PADDING_TOP + plotHeight;

  // Recharts-style hover: track the cursor across the plot area, resolve the
  // active month group + nearest bar, and follow the cursor with a tooltip.
  const handleMouseMove = (event: MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    const wrapper = wrapperRef.current;
    if (!svg || !wrapper || visibleData.length === 0) {
      return;
    }

    const bounds = svg.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) {
      return;
    }

    // Convert cursor position from screen pixels into SVG viewBox units.
    const x = ((event.clientX - bounds.left) / bounds.width) * chartWidth;
    const y = ((event.clientY - bounds.top) / bounds.height) * chartHeight;

    const insidePlot =
      x >= PADDING_LEFT &&
      x <= chartWidth - PADDING_RIGHT &&
      y >= PADDING_TOP &&
      y <= PADDING_TOP + plotHeight;

    if (!insidePlot) {
      setHover(null);
      setTooltipPosition(null);
      return;
    }

    const monthIndex = Math.min(
      visibleData.length - 1,
      Math.max(0, Math.floor((x - PADDING_LEFT) / slot)),
    );
    const groupX = PADDING_LEFT + slot * monthIndex + (slot - groupWidth) / 2;
    const seriesIndex = Math.min(
      SERIES.length - 1,
      Math.max(
        0,
        Math.round((x - groupX - barWidth / 2) / (barWidth + BAR_GAP)),
      ),
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
  // Plays once per data payload: container resizes re-render the bars but
  // must not replay the entrance (the guard skips those runs).
  const animatedDataRef = useRef<AdminMonthlyDataPoint[] | null>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || animatedDataRef.current === data) {
      return;
    }

    animatedDataRef.current = data;

    const bars = Array.from(
      svg.querySelectorAll<SVGRectElement>("rect.admin-chart-bar"),
    );

    const animations = bars.map((bar) => {
      const x = Number(bar.getAttribute("x") ?? 0);
      const width = Number(bar.getAttribute("width") ?? 0);

      // Pin the scale origin to the bar's own baseline point so each bar
      // stretches upward from y = 0 instead of shrinking toward its center.
      bar.style.transformOrigin = `${x + width / 2}px ${baselineY}px`;

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

  const hoveredPoint = hover ? visibleData[hover.monthIndex] : undefined;

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

      {/* Meaningful legend: explains what each bar color represents. */}
      <ul className="admin-chart-legend">
        {SERIES.map((series) => (
          <li key={series.key}>
            <span
              className="admin-chart-legend-dot"
              style={{ background: series.color }}
              aria-hidden="true"
            />
            {series.label}
          </li>
        ))}
      </ul>

      <div className="admin-bar-chart-wrapper" ref={wrapperRef}>
        <svg
          ref={svgRef}
          className="admin-bar-chart"
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
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
                  x2={chartWidth - PADDING_RIGHT}
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

          {visibleData.map((point, index) => {
            const groupX =
              PADDING_LEFT + slot * index + (slot - groupWidth) / 2;

            return (
              <g key={point.month + index}>
                {SERIES.map((series, seriesIndex) => {
                  const value = point[series.key];
                  const y = valueToY(value);
                  const x =
                    groupX + seriesIndex * (barWidth + BAR_GAP);
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
                      width={barWidth}
                      height={Math.max(0, PADDING_TOP + plotHeight - y)}
                      rx={3}
                      fill={series.color}
                      aria-label={`${point.month} — ${series.label}: ${value}`}
                    />
                  );
                })}

                <text
                  x={groupX + groupWidth / 2}
                  y={chartHeight - 10}
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
