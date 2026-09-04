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
const VALUE_STEP = 15;

const SERIES = [
  { key: "submitted", color: "#2563eb" },
  { key: "completed", color: "#059669" },
  { key: "rejected", color: "#f59e0b" },
] as const;

const MonthlyRequestsChart = ({ data }: MonthlyRequestsChartProps) => {
  const maxValue = Math.max(
    1,
    ...data.map((point) =>
      Math.max(point.submitted, point.completed, point.rejected),
    ),
  );

  const topValue = Math.max(
    VALUE_STEP,
    Math.ceil(maxValue / VALUE_STEP) * VALUE_STEP,
  );
  const plotWidth = WIDTH - PADDING_LEFT - PADDING_RIGHT;
  const plotHeight = HEIGHT - PADDING_TOP - PADDING_BOTTOM;
  const groupWidth = BAR_WIDTH * SERIES.length + BAR_GAP * (SERIES.length - 1);
  const slot = plotWidth / Math.max(1, data.length);

  const valueToY = (value: number): number =>
    PADDING_TOP + plotHeight - (value / topValue) * plotHeight;

  return (
    <section className="admin-panel admin-chart-panel">
      <h3 className="admin-panel-title">Monthly Requests Overview</h3>

      <svg
        className="admin-bar-chart"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="Monthly requests overview chart"
      >
        {Array.from({ length: GRID_INTERVALS + 1 }, (_, index) => {
          const value = (topValue / GRID_INTERVALS) * index;
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

                return (
                  <rect
                    key={series.key}
                    x={x}
                    y={y}
                    width={BAR_WIDTH}
                    height={Math.max(0, PADDING_TOP + plotHeight - y)}
                    rx={3}
                    fill={series.color}
                  >
                    <title>{`${point.month} — ${series.key}: ${value}`}</title>
                  </rect>
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
    </section>
  );
};

export default MonthlyRequestsChart;
