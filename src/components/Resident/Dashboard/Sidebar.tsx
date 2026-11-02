import { useEffect, useState } from "react";
import "../../../Styles/Resident/Components/ResidentSidebar.css";

import {
  AlertTriangle,
  Bell,
  ChevronDown,
  FileText,
  History as HistoryIcon,
  LayoutDashboard,
  List,
  Loader,
  PackageCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import wingsLogo from "../../../assets/logo-256.png";
import SidebarUserFooter from "../../SidebarUserFooter/SidebarUserFooter";
import {
  readRequestsTab,
  selectRequestsTab,
  subscribeRequestsTab,
  type RequestsTab,
} from "../../../Utils/Resident/requestsTab";

type SidebarProps = {
  firstName: string;
  lastName: string;
  role: string;
  activePage?:
    | "dashboard"
    | "my-requests"
    | "request-document"
    | "request-history"
    | "notifications"
    | "pothole-detection";
  onDashboard?: () => void;
  onMyRequests?: () => void;
  onRequestDocument?: () => void;
  onRequestHistory?: () => void;
  onNotifications?: () => void;
  onPotholeDetection?: () => void;
  onLogout: () => void;

  /** Mobile drawer state; ignored on desktop. */
  isOpen?: boolean;

  /** Closes the mobile drawer when a navigation item is chosen. */
  onNavigate?: () => void;
};

const NAV_ITEMS: {
  key: NonNullable<SidebarProps["activePage"]>;
  label: string;
  icon: LucideIcon;
  handlerKey:
    | "onDashboard"
    | "onMyRequests"
    | "onNotifications"
    | "onPotholeDetection";
}[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    handlerKey: "onDashboard",
  },
  {
    key: "my-requests",
    label: "My Requests",
    icon: FileText,
    handlerKey: "onMyRequests",
  },
  {
    key: "notifications",
    label: "Notifications",
    icon: Bell,
    handlerKey: "onNotifications",
  },
  {
    key: "pothole-detection",
    label: "Pothole Detection",
    icon: AlertTriangle,
    handlerKey: "onPotholeDetection",
  },
];

// Dropdown under "My Requests".
const REQUEST_FILTERS: { key: RequestsTab; label: string; icon: LucideIcon }[] =
  [
    { key: "all", label: "All requests", icon: List },
    { key: "active", label: "Active", icon: Loader },
    { key: "history", label: "History", icon: HistoryIcon },
    { key: "ready", label: "Ready for pickup", icon: PackageCheck },
  ];

const Sidebar = ({
  firstName,
  lastName,
  role,
  activePage = "dashboard",
  onDashboard,
  onMyRequests,
  onNotifications,
  onPotholeDetection,
  onLogout,
  isOpen = false,
  onNavigate,
}: SidebarProps) => {
  const handlers = {
    onDashboard,
    onMyRequests,
    onNotifications,
    onPotholeDetection,
  };

  const closeThen = (action: () => void) => () => {
    onNavigate?.();
    action();
  };

  const isRequestsPage = activePage === "my-requests";
  const [isRequestsOpen, setIsRequestsOpen] = useState(isRequestsPage);
  const [currentTab, setCurrentTab] = useState<RequestsTab>(readRequestsTab);

  // Keep the highlighted dropdown item in sync with the page's tabs.
  useEffect(() => subscribeRequestsTab(setCurrentTab), []);

  const handleRequestsToggle = () => {
    // On the My Requests page the item opens and closes the dropdown.
    if (isRequestsPage) {
      setIsRequestsOpen((open) => !open);
      return;
    }

    // From any other page it goes to My Requests (showing everything), where
    // the dropdown starts open.
    selectRequestsTab("all");
    if (onMyRequests) closeThen(onMyRequests)();
  };

  const handleRequestsFilter = (tab: RequestsTab) => {
    selectRequestsTab(tab);

    if (isRequestsPage) {
      onNavigate?.();
      return;
    }

    if (onMyRequests) closeThen(onMyRequests)();
  };

  return (
    <aside className={`sidebar${isOpen ? " is-open" : ""}`}>
      <div className="sidebar-logo">
        <div className="sidebar-logo-circle">
          <img src={wingsLogo} alt="Barangay Logo" />
        </div>

        <div>
          <h2>Lagab-e Portal</h2>
          <span>Community Portal</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => {
          const handler = handlers[item.handlerKey];
          const isActive = activePage === item.key;
          const Icon = item.icon;

          if (item.key === "my-requests") {
            return (
              <div className="nav-group" key={item.key}>
                <button
                  type="button"
                  className={`nav-item nav-button nav-group-toggle ${
                    isActive ? "active" : ""
                  }`}
                  onClick={handleRequestsToggle}
                  disabled={!handler}
                  aria-expanded={isRequestsOpen}
                  aria-controls="sidebar-requests-menu"
                >
                  <span className="nav-icon">
                    <Icon size={19} strokeWidth={1.9} aria-hidden="true" />
                  </span>
                  {item.label}
                  <ChevronDown
                    className="nav-chevron"
                    size={16}
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                </button>

                <div
                  id="sidebar-requests-menu"
                  className={`nav-submenu${isRequestsOpen ? " is-open" : ""}`}
                >
                  <div className="nav-submenu-inner">
                    {REQUEST_FILTERS.map((filter) => {
                      const FilterIcon = filter.icon;
                      const isCurrent =
                        isRequestsPage && currentTab === filter.key;

                      return (
                        <button
                          key={filter.key}
                          type="button"
                          className={`nav-subitem${isCurrent ? " active" : ""}`}
                          onClick={() => handleRequestsFilter(filter.key)}
                          aria-current={isCurrent ? "true" : undefined}
                        >
                          <FilterIcon
                            size={16}
                            strokeWidth={1.9}
                            aria-hidden="true"
                          />
                          {filter.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          }

          return (
            <button
              key={item.key}
              type="button"
              className={`nav-item nav-button ${isActive ? "active" : ""}`}
              onClick={handler ? closeThen(handler) : undefined}
              disabled={isActive || !handler}
            >
              <span className="nav-icon">
                <Icon size={19} strokeWidth={1.9} aria-hidden="true" />
              </span>
              {item.label}
            </button>
          );
        })}
      </nav>

      <SidebarUserFooter
        firstName={firstName}
        lastName={lastName}
        role={role}
        onLogout={onLogout}
      />
    </aside>
  );
};

export default Sidebar;
