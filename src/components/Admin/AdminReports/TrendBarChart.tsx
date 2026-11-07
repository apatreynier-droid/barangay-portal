import { useRef, useState } from "react";
import type { MouseEvent } from "react";
import {
  SERIES_COLOR,
  formatIsoRange,
  labelStride,
} from "../../../Utils/Admin/AdminAnalyticsDisplay";

export type TrendBarPoint = {
  label: string;
  value: number;
  period_start: string;
  period_end: string;
  /** Extra tooltip rows (e.g. the approved/pending split of a period). */
  details?: { label: string; value: number }[];
};

type TrendBarChartProps = {
  data: TrendBarPoint[];
  /** What one bar counts, e.g. "Registrations" (used in the tooltip). */
  valueLabel: string;
  ariaLabel: string;
  color?: string;
};

const WIDTH = 720;
const HEIGHT = 240;
const PADDING_LEFT = 40;
const PADDING_RIGHT = 12;
const PADDING_TOP = 14;
const PADDING_BOTTOM = 32;
const GRID_INTERVALS = 4;
const MAX_BAR_WIDTH = 28;
const MAX_LABELS = 12;
const NICE_STEPS = [1, 2, 5, 10, 15, 20, 25, 50, 100, 150, 200, 250, 500, 1000];

/**
 * Single-series bar chart for a period trend (one bar per day/week/month/
 * year). Bars stay readable for any number of periods: their width adapts
 * to the slot and only every n-th x-axis label is printed, while each bar
 * still has its own hover tooltip.
 */
const TrendBarChart = ({
  data,
  valueLabel,
  ariaLabel,
  color = SERIES_COLOR,
}: TrendBarChartProps) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number } | null>(null);

  const maxValue = Math.max(1, ...data.map((point) => point.value));
  const minStep = Math.max(1, Math.ceil(maxValue / GRID_INTERVALS));
  const step = NICE_STEPS.find((candidate) => candidate >= minStep) ?? minStep;
  const topValue = step * GRID_INTERVALS;
  const plotWidth = WIDTH - PADDING_LEFT - PADDING_RIGHT;
  const plotHeight = HEIGHT - PADDING_TOP - PADDING_BOTTOM;
  const baseline = PADDING_TOP + plotHeight;
  const slot = plotWidth / Math.max(1, data.length);
  const gap = Math.min(6, slot * 0.25);
  const barWidth = Math.max(1, Math.min(MAX_BAR_WIDTH, slot - gap));
  const stride = labelStride(data.length, MAX_LABELS);

  const valueToY = (value: number): number =>
    PADDING_TOP + plotHeight - (value / topValue) * plotHeight;

  const handleMouseMove = (event: MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    const wrapper = wrapperRef.current;
    if (!svg || !wrapper || data.length === 0) {
      return;
    }

    const bounds = svg.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * WIDTH;
    if (x < PADDING_LEFT || x > WIDTH - PADDING_RIGHT) {
      setHoverIndex(null);
      setTooltip(null);
      return;
    }

    setHoverIndex(
      Math.min(data.length - 1, Math.max(0, Math.floor((x - PADDING_LEFT) / slot))),
    );
    const wrapperBounds = wrapper.getBoundingClientRect();
    setTooltip({
      x: Math.min(event.clientX - wrapperBounds.left + 14, wrapperBounds.width - 190),
      y: event.clientY - wrapperBounds.top + 14,
    });
  };

  const handleMouseLeave = () => {
    setHoverIndex(null);
    setTooltip(null);
  };

  const hovered = hoverIndex !== null ? data[hoverIndex] : undefined;

  return (
    <div className="reports-bar-chart-wrapper" ref={wrapperRef}>
      <svg
        ref={svgRef}
        className="reports-chart"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={ariaLabel}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {Array.from({ length: GRID_INTERVALS + 1 }, (_, index) => {
          const value = step * index;
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
                x={PADDING_LEFT - 8}
                y={y + 4}
                textAnchor="end"
                className="admin-chart-axis-label"
              >
                {value}
              </text>
            </g>
          );
        })}

        <rect
          className={`admin-chart-cursor${hovered ? " is-visible" : ""}`}
          x={hoverIndex !== null ? PADDING_LEFT + slot * hoverIndex : 0}
          y={PADDING_TOP}
          width={slot}
          height={plotHeight}
          rx={4}
        />

        {data.map((point, index) => {
          const x = PADDING_LEFT + slot * index + (slot - barWidth) / 2;
          const y = valueToY(point.value);
          return (
            <g key={`${point.period_start}-${index}`}>
              {point.value > 0 && (
                <rect
                  className={`reports-bar${hoverIndex === index ? " is-active" : ""}`}
                  x={x}
                  y={y}
                  width={barWidth}
                  height={Math.max(0, baseline - y)}
                  rx={Math.min(4, barWidth / 2)}
                  fill={color}
                />
              )}
              {index % stride === 0 && (
                <text
                  x={PADDING_LEFT + slot * index + slot / 2}
                  y={HEIGHT - 10}
                  textAnchor="middle"
                  className="admin-chart-axis-label"
                >
                  {point.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {hovered && tooltip && (
        <div
          className="admin-chart-tooltip"
          style={{ left: Math.max(0, tooltip.x), top: tooltip.y }}
          aria-hidden="true"
        >
          <p className="admin-chart-tooltip-title">
            {formatIsoRange(hovered.period_start, hovered.period_end)}
          </p>
          <div className="admin-chart-tooltip-row is-active">
            <span className="admin-chart-tooltip-dot" style={{ background: color }} />
            <span className="admin-chart-tooltip-label">{valueLabel}</span>
            <span className="admin-chart-tooltip-value">{hovered.value}</span>
          </div>
          {hovered.details?.map((detail) => (
            <div key={detail.label} className="admin-chart-tooltip-row">
              <span className="admin-chart-tooltip-label">{detail.label}</span>
              <span className="admin-chart-tooltip-value">{detail.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TrendBarChart;
