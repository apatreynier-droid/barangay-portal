import type { AdminPurokCount } from "../../../Types/Admin/AdminReportsType";

type ResidentsByPurokChartProps = {
  data: AdminPurokCount[];
};

const LABEL_WIDTH = 70;
const PADDING_TOP = 12;
const PADDING_BOTTOM = 30;
const ROW_HEIGHT = 62;
const BAR_HEIGHT = 24;
const GRID_INTERVALS = 4;

const WIDTH = 340;
const BAR_COLOR = "#2563eb";

const ResidentsByPurokChart = ({ data }: ResidentsByPurokChartProps) => {
  const maxValue = Math.max(1, ...data.map((item) => item.count));
  const step = Math.max(1, Math.ceil(maxValue / GRID_INTERVALS));
  const topValue = Math.max(step, Math.ceil(maxValue / step) * step);

  const plotWidth = WIDTH - LABEL_WIDTH - 24;
  const plotHeight = data.length * ROW_HEIGHT;
  const height = PADDING_TOP + plotHeight + PADDING_BOTTOM;
  const valueToWidth = (value: number): number =>
    (value / topValue) * plotWidth;

  const ticks: number[] = [];
  for (let tick = 0; tick <= topValue; tick += step) {
    ticks.push(tick);
  }

  return (
    <section className="admin-panel reports-panel">
      <h3 className="admin-panel-title">Residents by Purok</h3>

      {data.length === 0 ? (
        <p className="reports-chart-empty">
          No resident purok data available yet.
        </p>
      ) : (
        <svg
          className="reports-chart"
          viewBox={`0 0 ${WIDTH} ${height}`}
          role="img"
          aria-label="Residents by purok"
        >
          {/* Vertical gridlines */}
          {ticks.map((tick) => {
            const x = LABEL_WIDTH + valueToWidth(tick);

            return (
              <g key={`tick-${tick}`}>
                <line
                  x1={x}
                  y1={PADDING_TOP}
                  x2={x}
                  y2={PADDING_TOP + plotHeight}
                  className="admin-chart-gridline"
                />
                <text
                  x={x}
                  y={height - 10}
                  textAnchor="middle"
                  className="admin-chart-axis-label"
                >
                  {tick}
                </text>
              </g>
            );
          })}

          {data.map((item, index) => {
            const y =
              PADDING_TOP + index * ROW_HEIGHT + (ROW_HEIGHT - BAR_HEIGHT) / 2;
            const width = Math.max(2, valueToWidth(item.count));

            return (
              <g key={item.purok}>
                <text
                  x={LABEL_WIDTH - 10}
                  y={y + BAR_HEIGHT / 2 + 4}
                  textAnchor="end"
                  className="reports-purok-label"
                >
                  {item.purok}
                </text>

                <rect
                  x={LABEL_WIDTH}
                  y={y}
                  width={width}
                  height={BAR_HEIGHT}
                  rx={4}
                  fill={BAR_COLOR}
                  aria-label={`${item.purok}: ${item.count} residents`}
                >
                  <title>{`${item.purok}: ${item.count} residents`}</title>
                </rect>
              </g>
            );
          })}
        </svg>
      )}
    </section>
  );
};

export default ResidentsByPurokChart;
