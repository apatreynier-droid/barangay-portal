import type { RequestsTab } from "../../../Utils/Resident/requestsTab";
export type { RequestsTab };

type RequestsTabsProps = {
  activeTab: RequestsTab;
  onTabChange: (tab: RequestsTab) => void;
  allCount: number;
  activeCount: number;
  historyCount: number;
  readyCount: number;
};

const TABS: { key: RequestsTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "ready", label: "Ready" },
  { key: "history", label: "History" },
];

const RequestsTabs = ({
  activeTab,
  onTabChange,
  allCount,
  activeCount,
  historyCount,
  readyCount,
}: RequestsTabsProps) => {
  const counts: Record<RequestsTab, number> = {
    all: allCount,
    active: activeCount,
    history: historyCount,
    ready: readyCount,
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
