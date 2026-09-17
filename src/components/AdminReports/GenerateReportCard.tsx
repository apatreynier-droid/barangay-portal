type GenerateReportCardProps = {
  onExportCsv: () => void;
  onPrint: () => void;
};

const GenerateReportCard = ({
  onExportCsv,
  onPrint,
}: GenerateReportCardProps) => {
  return (
    <section className="admin-panel reports-generate-card">
      <div className="reports-generate-info">
        <h3 className="reports-generate-title">Generate Report</h3>
        <p className="reports-generate-subtitle">
          Export data for monthly or annual reporting
        </p>
      </div>

      <div className="reports-generate-actions">
        <button
          type="button"
          className="reports-export-button"
          onClick={onExportCsv}
        >
          <span aria-hidden="true">📄</span>
          Export CSV
        </button>

        <button
          type="button"
          className="reports-print-button"
          onClick={onPrint}
        >
          <span aria-hidden="true">🖨</span>
          Print Report
        </button>
      </div>
    </section>
  );
};

export default GenerateReportCard;
