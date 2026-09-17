import { useRef, useState } from "react";
import type { MouseEvent } from "react";
import type { AdminDocumentTypeCount } from "../../Types/AdminDashboardType";

type DocumentTypePieChartProps = {
  data: AdminDocumentTypeCount[];
};

const SIZE = 200;
const RADIUS = 90;
const COLORS = [
  "#2563eb",
  "#8b5cf6",
  "#059669",
  "#f59e0b",
  "#ef4444",
  "#06b6d4",
];

// How far the hovered slice expands outward from the pie's center.
const SLICE_EXPAND = 7;

type TooltipPosition = { x: number; y: number };

const DocumentTypePieChart = ({ data }: DocumentTypePieChartProps) => {
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
                      d={slicePath(startAngle, endAngle)}
                      fill={COLORS[index % COLORS.length]}
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
