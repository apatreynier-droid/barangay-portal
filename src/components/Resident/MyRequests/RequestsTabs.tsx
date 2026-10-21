export type RequestsTab = "all" | "active" | "history";

type RequestsTabsProps = {
  activeTab: RequestsTab;
  onTabChange: (tab: RequestsTab) => void;
  allCount: number;
  activeCount: number;
  historyCount: number;
};

const TABS: { key: RequestsTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "history", label: "History" },
];

const RequestsTabs = ({
  activeTab,
  onTabChange,
  allCount,
  activeCount,
  historyCount,
}: RequestsTabsProps) => {
  const counts: Record<RequestsTab, number> = {
    all: allCount,
    active: activeCount,
    history: historyCount,
  };

  return (
    <div className="requests-tabs" role="tablist" aria-label="Request views">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.key}
          className={`requests-tab ${activeTab === tab.key ? "active" : ""}`}
          onClick={() => onTabChange(tab.key)}
        >
          {tab.label}
          <span className="requests-tab-count">{counts[tab.key]}</span>
        </button>
      ))}
    </div>
  );
};

export default RequestsTabs;
