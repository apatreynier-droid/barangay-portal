import type { AdminDocumentTypeCount } from "../../Types/AdminDashboardType";

type DocumentTypeDonutProps = {
  data: AdminDocumentTypeCount[];
};

const SIZE = 180;
const RADIUS = 70;
const STROKE_WIDTH = 30;
const COLORS = ["#2563eb", "#8b5cf6", "#059669", "#f59e0b", "#ef4444"];

const DocumentTypeDonut = ({ data }: DocumentTypeDonutProps) => {
  const total = data.reduce((sum, item) => sum + item.count, 0);
  const circumference = 2 * Math.PI * RADIUS;
  const center = SIZE / 2;

  let cumulativeOffset = 0;

  return (
    <section className="admin-panel">
      <h3 className="admin-panel-title">By Document Type</h3>

      {data.length === 0 ? (
        <p className="admin-empty-note">No document requests yet.</p>
      ) : (
        <>
          <div className="admin-donut-wrapper">
            <svg
              width={SIZE}
              height={SIZE}
              viewBox={`0 0 ${SIZE} ${SIZE}`}
              role="img"
              aria-label="Requests by document type chart"
            >
              <g transform={`rotate(-90 ${center} ${center})`}>
                {data.map((item, index) => {
                  const fraction = total > 0 ? item.count / total : 0;
                  const dash = fraction * circumference;
                  const offset = cumulativeOffset;

                  cumulativeOffset += dash;

                  return (
                    <circle
                      key={item.document_name}
                      cx={center}
                      cy={center}
                      r={RADIUS}
                      fill="none"
                      stroke={COLORS[index % COLORS.length]}
                      strokeWidth={STROKE_WIDTH}
                      strokeDasharray={`${dash} ${circumference - dash}`}
                      strokeDashoffset={-offset}
                    >
                      <title>{`${item.document_name}: ${item.count}`}</title>
                    </circle>
                  );
                })}
              </g>
            </svg>
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
