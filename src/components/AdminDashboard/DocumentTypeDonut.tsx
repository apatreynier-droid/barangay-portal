import { useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import type { AdminDocumentTypeCount } from "../../Types/AdminDashboardType";

type DocumentTypeDonutProps = {
  data: AdminDocumentTypeCount[];
};

const SIZE = 180;
const RADIUS = 70;
const STROKE_WIDTH = 30;
const COLORS = ["#2563eb", "#8b5cf6", "#059669", "#f59e0b", "#ef4444"];

// Entrance animation settings (Recharts-equivalent):
// isAnimationActive={true}
// animationDuration={1500}
// animationEasing="ease-out"
const ANIMATION_DURATION = 1500;
const ANIMATION_EASING = "ease-out";

// How far the hovered slice expands outward from the pie's center.
const SLICE_EXPAND = 7;

// Keeps the hover tooltip inside the panel when the cursor is near its edges.
const TOOLTIP_OFFSET = 14;
const TOOLTIP_MAX_WIDTH = 220;
const TOOLTIP_MAX_HEIGHT = 90;

type TooltipPosition = { x: number; y: number };

const DocumentTypeDonut = ({ data }: DocumentTypeDonutProps) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [tooltipPosition, setTooltipPosition] =
    useState<TooltipPosition | null>(null);

  const total = data.reduce((sum, item) => sum + item.count, 0);
  const circumference = 2 * Math.PI * RADIUS;
  const center = SIZE / 2;

  let cumulativeOffset = 0;

  // Entrance animation: the pie sweeps/arcs into view from its starting
  // angle (top) once the real chart data has loaded. The parent only mounts
  // this component after the dashboard fetch resolves, so mounting here
  // means the data is ready. Each slice's dash length animates from 0 to
  // its final arc, with a delay proportional to its cumulative offset, so
  // the slices draw one after another like a single sweeping pie.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || data.length === 0) {
      return;
    }

    const slices = Array.from(
      svg.querySelectorAll<SVGCircleElement>("circle.admin-donut-slice"),
    );

    let cumulative = 0;

    const animations = slices.map((slice, index) => {
      const item = data[index];
      const fraction = item && total > 0 ? item.count / total : 0;
      const dash = fraction * circumference;
      const delay = (cumulative / circumference) * ANIMATION_DURATION;
      cumulative += dash;

      return slice.animate(
        {
          strokeDasharray: [
            `0 ${circumference}`,
            `${dash} ${circumference - dash}`,
          ],
        },
        {
          duration: ANIMATION_DURATION,
          delay,
          easing: ANIMATION_EASING,
          fill: "both",
        },
      );
    });

    return () => {
      animations.forEach((animation) => animation.cancel());
    };
  }, [data, total, circumference]);

  // Tooltip follows the cursor while it is over the donut.
  const handleMouseMove = (event: MouseEvent<SVGSVGElement>) => {
    const wrapper = wrapperRef.current;
    if (!wrapper) {
      return;
    }

    const bounds = wrapper.getBoundingClientRect();
    setTooltipPosition({
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    });
  };

  const handleMouseLeave = () => {
    setHoveredIndex(null);
    setTooltipPosition(null);
  };

  const hoveredItem = hoveredIndex !== null ? data[hoveredIndex] : undefined;

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
    <section className="admin-panel">
      <h3 className="admin-panel-title">By Document Type</h3>

      {data.length === 0 ? (
        <p className="admin-empty-note">No document requests yet.</p>
      ) : (
        <>
          <div
            className="admin-donut-wrapper"
            ref={wrapperRef}
          >
            <svg
              ref={svgRef}
              width={SIZE}
              height={SIZE}
              viewBox={`0 0 ${SIZE} ${SIZE}`}
              role="img"
              aria-label="Requests by document type chart"
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
            >
              <g transform={`rotate(-90 ${center} ${center})`}>
                {data.map((item, index) => {
                  const fraction = total > 0 ? item.count / total : 0;
                  const dash = fraction * circumference;
                  const offset = cumulativeOffset;

                  cumulativeOffset += dash;

                  // Mid-angle of the slice (in the rotated group's local
                  // coordinates) so the hovered slice expands radially.
                  const midAngle =
                    ((offset + dash / 2) / circumference) * Math.PI * 2;
                  const isHovered = hoveredIndex === index;
                  const dx = isHovered
                    ? Math.cos(midAngle) * SLICE_EXPAND
                    : 0;
                  const dy = isHovered
                    ? Math.sin(midAngle) * SLICE_EXPAND
                    : 0;

                  return (
                    <circle
                      key={item.document_name}
                      className="admin-donut-slice"
                      cx={center}
                      cy={center}
                      r={RADIUS}
                      fill="none"
                      stroke={COLORS[index % COLORS.length]}
                      strokeWidth={STROKE_WIDTH}
                      strokeDasharray={`${dash} ${circumference - dash}`}
                      strokeDashoffset={-offset}
                      style={{ transform: `translate(${dx}px, ${dy}px)` }}
                      onMouseEnter={() => setHoveredIndex(index)}
                      onMouseLeave={() =>
                        setHoveredIndex((current) =>
                          current === index ? null : current,
                        )
                      }
                      aria-label={`${item.document_name}: ${item.count}`}
                    />
                  );
                })}
              </g>
            </svg>

            {hoveredItem && tooltipPosition && (
              <div
                className="admin-chart-tooltip"
                style={{ left: tooltipLeft, top: tooltipTop }}
                aria-hidden="true"
              >
                <p className="admin-chart-tooltip-title">
                  {hoveredItem.document_name}
                </p>
                <div className="admin-chart-tooltip-row">
                  <span
                    className="admin-chart-tooltip-dot"
                    style={{
                      background:
                        COLORS[(hoveredIndex ?? 0) % COLORS.length],
                    }}
                  />
                  <span className="admin-chart-tooltip-label">
                    Requests
                  </span>
                  <span className="admin-chart-tooltip-value">
                    {hoveredItem.count}
                  </span>
                </div>
              </div>
            )}
          </div>

          <ul className="admin-donut-legend">
            {data.map((item, index) => (
              <li key={item.document_name}>
                <span
                  className="admin-legend-dot"
                  style={{
                    background: COLORS[index % COLORS.length],
                  }}
                  aria-hidden="true"
                />
                <span className="admin-legend-name">{item.document_name}</span>
                <span className="admin-legend-count">{item.count}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
};

export default DocumentTypeDonut;
