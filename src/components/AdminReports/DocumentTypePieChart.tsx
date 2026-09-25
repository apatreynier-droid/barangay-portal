import { useRef, useState } from "react";
import type { MouseEvent } from "react";
import type { AdminDocumentTypeCount } from "../../Types/AdminDashboardType";

type DocumentTypePieChartProps = {
  data: AdminDocumentTypeCount[];
};

const SIZE = 200;
const RADIUS = 90;
// Same muted palette as the dashboard donut so document-type colors stay
// consistent across the portal.
const COLORS = [
  "#3d6ea8",
  "#7b6bb5",
  "#3a8266",
  "#9a6b2a",
  "#b25f57",
  "#4f8a99",
];

// How far the hovered slice expands outward from the pie's center.
const SLICE_EXPAND = 7;

type TooltipPosition = { x: number; y: number };

const DocumentTypePieChart = ({ data }: DocumentTypePieChartProps) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [tooltipPosition, setTooltipPosition] =
    useState<TooltipPosition | null>(null);

  const total = data.reduce((sum, item) => sum + item.count, 0);
  const center = SIZE / 2;

  const slicePath = (startAngle: number, endAngle: number): string => {
    const x1 = center + RADIUS * Math.sin(startAngle);
    const y1 = center - RADIUS * Math.cos(startAngle);
    const x2 = center + RADIUS * Math.sin(endAngle);
    const y2 = center - RADIUS * Math.cos(endAngle);
    const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;

    return [
      `M ${center} ${center}`,
      `L ${x1} ${y1}`,
      `A ${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${x2} ${y2}`,
      "Z",
    ].join(" ");
  };

  // Resolve the hovered slice from the pointer position instead of the slice's
  // own mouse events. A hovered slice translates outward, so the shape slides
  // out from under the cursor and the browser kept firing enter/leave events
  // back and forth (visible flicker). Hit-testing the static pie geometry keeps
  // the hover state steady while the slice animates.
  const resolveSliceIndex = (x: number, y: number): number | null => {
    const offsetX = x - center;
    const offsetY = y - center;

    if (total <= 0 || Math.hypot(offsetX, offsetY) > RADIUS) {
      return null;
    }

    // Same orientation as slicePath(): 0 rad at 12 o'clock, growing clockwise.
    let angle = Math.atan2(offsetX, -offsetY);
    if (angle < 0) {
      angle += Math.PI * 2;
    }

    let sweptAngle = 0;

    for (let index = 0; index < data.length; index += 1) {
      const fraction = data[index].count / total;
      sweptAngle += fraction * Math.PI * 2;

      // Document types without requests have no slice to hover.
      if (fraction > 0 && angle <= sweptAngle) {
        return index;
      }
    }

    // Rounding can push the final angle just past the full circle.
    for (let index = data.length - 1; index >= 0; index -= 1) {
      if (data[index].count > 0) {
        return index;
      }
    }

    return null;
  };

  // Tooltip follows the cursor while it is over the pie.
  const handleMouseMove = (event: MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    const wrapper = wrapperRef.current;
    if (!svg || !wrapper) {
      return;
    }

    const bounds = svg.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) {
      return;
    }

    // The square viewBox is letterboxed inside the rendered box, so pointer
    // coordinates are converted through the uniform scale the browser applies.
    const scale = Math.min(bounds.width, bounds.height) / SIZE;
    const offsetLeft = bounds.left + (bounds.width - SIZE * scale) / 2;
    const offsetTop = bounds.top + (bounds.height - SIZE * scale) / 2;
    const index = resolveSliceIndex(
      (event.clientX - offsetLeft) / scale,
      (event.clientY - offsetTop) / scale,
    );

    if (index === null) {
      setHoveredIndex(null);
      setTooltipPosition(null);
      return;
    }

    setHoveredIndex(index);

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

  const hoveredItem = hoveredIndex !== null ? data[hoveredIndex] : undefined;
  const tooltipLeft = tooltipPosition ? tooltipPosition.x + 14 : 0;
  const tooltipTop = tooltipPosition ? tooltipPosition.y + 14 : 0;

  return (
    <section className="admin-panel reports-panel">
      <h3 className="admin-panel-title">Requests by Document Type</h3>

      {data.length === 0 ? (
        <p className="reports-chart-empty">No request data available yet.</p>
      ) : (
        <>
          <div className="reports-pie-wrapper" ref={wrapperRef}>
            <svg
              ref={svgRef}
              className="reports-chart reports-pie-chart"
              viewBox={`0 0 ${SIZE} ${SIZE}`}
              role="img"
              aria-label="Requests by document type"
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
            >
              {(() => {
                let cumulativeAngle = 0;

                return data.map((item, index) => {
                  const fraction = total > 0 ? item.count / total : 0;
                  const startAngle = cumulativeAngle;
                  const endAngle = cumulativeAngle + fraction * Math.PI * 2;
                  cumulativeAngle = endAngle;

                  const midAngle = (startAngle + endAngle) / 2;
                  // The active slice expands outward; the movement is eased by
                  // CSS (.reports-pie-slice) so it glides out and back instead
                  // of jumping, and only this slice's transform changes.
                  const isHovered = hoveredIndex === index;
                  const dx = isHovered
                    ? Math.sin(midAngle) * SLICE_EXPAND
                    : 0;
                  const dy = isHovered
                    ? -Math.cos(midAngle) * SLICE_EXPAND
                    : 0;

                  return (
                    <path
                      key={item.document_name}
                      className="reports-pie-slice"
                      d={slicePath(startAngle, endAngle)}
                      fill={COLORS[index % COLORS.length]}
                      style={{ transform: `translate(${dx}px, ${dy}px)` }}
                      aria-label={`${item.document_name}: ${item.count}`}
                    />
                  );
                });
              })()}
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
                  <span className="admin-chart-tooltip-label">Requests</span>
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

export default DocumentTypePieChart;
