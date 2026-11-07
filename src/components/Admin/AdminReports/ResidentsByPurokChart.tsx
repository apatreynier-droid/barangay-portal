import type { AdminPurokCount } from "../../../Types/Admin/AdminReportsType";

type ResidentsByPurokChartProps = {
  data: AdminPurokCount[];
};

const LABEL_WIDTH = 84;
const PADDING_TOP = 12;
const PADDING_BOTTOM = 30;
/** Rows get shorter when all seven Puroks (+ "Not specified") are listed. */
const ROW_HEIGHT_FEW = 62;
const ROW_HEIGHT_MANY = 40;
const BAR_HEIGHT = 20;
const GRID_INTERVALS = 4;
/** Room on the right for the count printed at the end of each bar. */
const VALUE_GUTTER = 34;

const WIDTH = 340;
const BAR_COLOR = "#2563eb";
/** Residents without a Purok are missing data, drawn in a muted gray. */
const UNSPECIFIED_LABEL = "Not specified";
const UNSPECIFIED_COLOR = "#94a3b8";

const ResidentsByPurokChart = ({ data }: ResidentsByPurokChartProps) => {
  const maxValue = Math.max(1, ...data.map((item) => item.count));
  const step = Math.max(1, Math.ceil(maxValue / GRID_INTERVALS));
  const topValue = Math.max(step, Math.ceil(maxValue / step) * step);

  const ROW_HEIGHT = data.length > 5 ? ROW_HEIGHT_MANY : ROW_HEIGHT_FEW;
  const plotWidth = WIDTH - LABEL_WIDTH - VALUE_GUTTER;
  const plotHeight = data.length * ROW_HEIGHT;
  const total = data.reduce((sum, item) => sum + item.count, 0);
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

      {data.length === 0 || total === 0 ? (
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
            // A Purok with no residents gets no bar (0 is drawn as 0).
            const width = valueToWidth(item.count);
            const isUnspecified = item.purok === UNSPECIFIED_LABEL;

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

                {width > 0 && (
                  <rect
                    x={LABEL_WIDTH}
                    y={y}
                    width={width}
                    height={BAR_HEIGHT}
                    rx={Math.min(4, width / 2)}
                    fill={isUnspecified ? UNSPECIFIED_COLOR : BAR_COLOR}
                    aria-label={`${item.purok}: ${item.count} residents`}
                  >
                    <title>{`${item.purok}: ${item.count} residents`}</title>
                  </rect>
                )}

                <text
                  x={LABEL_WIDTH + width + 6}
                  y={y + BAR_HEIGHT / 2 + 4}
                  className="reports-purok-value"
                >
                  {item.count}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </section>
  );
};

export default ResidentsByPurokChart;
