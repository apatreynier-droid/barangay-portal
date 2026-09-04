import { useCallback, useEffect, useState } from "react";
import LoginPage from "./Pages/Login/LoginPage";
import CreateAccount from "./Pages/CreateAccount/CreateAccount";
import Dashboard from "./Pages/Dashboard/Dashboard";
import MyRequests from "./Pages/MyRequests/MyRequests";
import RequestHistory from "./Pages/RequestHistory/RequestHistory";
import NotificationPage from "./Pages/Notification/NotificationPage";
import RequestDocumentPage from "./Pages/RequestDocument/RequestDocumentPage";
import {
  clearSession,
  fetchNotifications,
  fetchRequests,
  getSessionUser,
  logoutUser,
  mapApiRequest,
  type ApiNotification,
  type AuthUser,
} from "./Utils/api";
import type { Request } from "./Types/DashboardType";

type Page =
  | "dashboard"
  | "my-requests"
  | "request-history"
  | "notifications"
  | "request-document";

function App() {
  const [user, setUser] = useState<AuthUser | null>(getSessionUser);
  const [page, setPage] = useState<Page>("dashboard");
  const [requests, setRequests] = useState<Request[]>([]);
  const [notifications, setNotifications] = useState<ApiNotification[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [dataError, setDataError] = useState("");
  const [showCreateAccount, setShowCreateAccount] = useState(false);

  const loadUserData = useCallback(async () => {
    setIsLoadingData(true);
    setDataError("");

    try {
      const [apiRequests, apiNotifications] = await Promise.all([
        fetchRequests(),
        fetchNotifications(),
      ]);

      setRequests(apiRequests.map(mapApiRequest));
      setNotifications(apiNotifications);
    } catch {
      setDataError("Could not load your data. Please try again.");
    } finally {
      setIsLoadingData(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      void loadUserData();
    }
  }, [user, loadUserData]);

  const openRequestDocument = () => {
    setPage("request-document");
  };

  const handleRequestCreated = () => {
    void loadUserData();
    setPage("my-requests");
  };

  const handleLogout = () => {
    void logoutUser();
    setUser(null);
    setRequests([]);
    setNotifications([]);
  };

  const handleSessionExpired = () => {
    clearSession();
    setUser(null);
    setRequests([]);
    setNotifications([]);
  };

  if (!user) {
    if (showCreateAccount) {
      return (
        <CreateAccount onBackToLogin={() => setShowCreateAccount(false)} />
      );
    }

    return (
      <LoginPage
        onLoginSuccess={() => setUser(getSessionUser())}
        onCreateAccount={() => setShowCreateAccount(true)}
      />
    );
  }

  if (page === "dashboard") {
    return (
      <Dashboard
        user={user}
        requests={requests}
        notifications={notifications}
        isLoadingData={isLoadingData}
        dataError={dataError}
        onRetry={() => void loadUserData()}
        onMyRequests={() => setPage("my-requests")}
        onRequestHistory={() => setPage("request-history")}
        onNotifications={() => setPage("notifications")}
        onRequestDocument={openRequestDocument}
        onLogout={handleLogout}
      />
    );
  }

  if (page === "my-requests") {
    return (
      <MyRequests
        user={user}
        requests={requests}
        isLoadingData={isLoadingData}
        dataError={dataError}
        onRetry={() => void loadUserData()}
        onBackToDashboard={() => setPage("dashboard")}
        onMyRequests={() => setPage("my-requests")}
        onRequestHistory={() => setPage("request-history")}
        onNotifications={() => setPage("notifications")}
        onRequestDocument={() => openRequestDocument()}
        onLogout={handleLogout}
      />
    );
  }

  if (page === "request-history") {
    return (
      <RequestHistory
        requests={requests}
        isLoadingData={isLoadingData}
        dataError={dataError}
        onRetry={() => void loadUserData()}
        onBackToDashboard={() => setPage("dashboard")}
        onMyRequests={() => setPage("my-requests")}
        onNotifications={() => setPage("notifications")}
        onRequestDocument={() => openRequestDocument()}
        onLogout={handleLogout}
      />
    );
  }

  if (page === "notifications") {
    return (
      <NotificationPage
        notifications={notifications}
        onNotificationsChanged={loadUserData}
        onSessionExpired={handleSessionExpired}
        onBackToDashboard={() => setPage("dashboard")}
        onMyRequests={() => setPage("my-requests")}
        onRequestHistory={() => setPage("request-history")}
        onRequestDocument={() => openRequestDocument()}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <RequestDocumentPage
      onBackToDashboard={() => setPage("dashboard")}
      onMyRequests={() => setPage("my-requests")}
      onRequestHistory={() => setPage("request-history")}
      onNotifications={() => setPage("notifications")}
      onRequestSubmitted={handleRequestCreated}
      onSessionExpired={handleSessionExpired}
      onLogout={handleLogout}
    />
  );
}

export default App;
