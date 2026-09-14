import { useCallback, useEffect, useState } from "react";
import LoginPage from "./Pages/Login/LoginPage";
import CreateAccount from "./Pages/CreateAccount/CreateAccount";
import Dashboard from "./Pages/Dashboard/Dashboard";
import AdminDashboard from "./Pages/AdminDashboard/AdminDashboard";
import AdminResidents from "./Pages/AdminResidents/AdminResidents";
import AdminDocumentRequests from "./Pages/AdminDocumentRequests/AdminDocumentRequests";
import AdminRequestHistory from "./Pages/AdminRequestHistory/AdminRequestHistory";
import AdminDocumentManagement from "./Pages/AdminDocumentManagement/AdminDocumentManagement";
import AdminApprovals from "./Pages/AdminApprovals/AdminApprovals";
import MyRequests from "./Pages/MyRequests/MyRequests";
import RequestHistory from "./Pages/RequestHistory/RequestHistory";
import NotificationPage from "./Pages/Notification/NotificationPage";
import RequestDocumentPage from "./Pages/RequestDocument/RequestDocumentPage";
import ForgotPasswordPage from "./Pages/ForgotPassword/ForgotPasswordPage";
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
  | "residents"
  | "document-requests"
  | "admin-request-history"
  | "document-management"
  | "approvals"
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
  const [showForgotPassword, setShowForgotPassword] = useState(false);

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

    if (showForgotPassword) {
      return (
        <ForgotPasswordPage onBackToLogin={() => setShowForgotPassword(false)} />
      );
    }

    return (
      <LoginPage
        onLoginSuccess={() => setUser(getSessionUser())}
        onCreateAccount={() => setShowCreateAccount(true)}
        onForgotPassword={() => setShowForgotPassword(true)}
      />
    );
  }

  const unreadCount = notifications.filter(
    (notification) => !notification.is_read,
  ).length;
  const isAdmin = user.role === "admin";

  if (page === "dashboard" && isAdmin) {
    return (
      <AdminDashboard
        user={user}
        unreadNotifications={unreadCount}
        onNotifications={() => setPage("notifications")}
        onResidents={() => setPage("residents")}
        onDocumentRequests={() => setPage("document-requests")}
        onRequestHistory={() => setPage("admin-request-history")}
        onApprovals={() => setPage("approvals")}
        onDocumentManagement={() => setPage("document-management")}
        onLogout={handleLogout}
      />
    );
  }

  if (page === "residents" && isAdmin) {
    return (
      <AdminResidents
        user={user}
        unreadNotifications={unreadCount}
        onDashboard={() => setPage("dashboard")}
        onDocumentRequests={() => setPage("document-requests")}
        onRequestHistory={() => setPage("admin-request-history")}
        onApprovals={() => setPage("approvals")}
        onDocumentManagement={() => setPage("document-management")}
        onNotifications={() => setPage("notifications")}
        onLogout={handleLogout}
      />
    );
  }

  if (page === "approvals" && isAdmin) {
    return (
      <AdminApprovals
        user={user}
        unreadNotifications={unreadCount}
        onDashboard={() => setPage("dashboard")}
        onResidents={() => setPage("residents")}
        onDocumentRequests={() => setPage("document-requests")}
        onRequestHistory={() => setPage("admin-request-history")}
        onDocumentManagement={() => setPage("document-management")}
        onNotifications={() => setPage("notifications")}
        onLogout={handleLogout}
      />
    );
  }

  if (page === "document-requests" && isAdmin) {
    return (
      <AdminDocumentRequests
        user={user}
        unreadNotifications={unreadCount}
        onDashboard={() => setPage("dashboard")}
        onResidents={() => setPage("residents")}
        onNotifications={() => setPage("notifications")}
        onRequestHistory={() => setPage("admin-request-history")}
        onApprovals={() => setPage("approvals")}
        onDocumentManagement={() => setPage("document-management")}
        onLogout={handleLogout}
      />
    );
  }

  if (page === "admin-request-history" && isAdmin) {
    return (
      <AdminRequestHistory
        user={user}
        unreadNotifications={unreadCount}
        onDashboard={() => setPage("dashboard")}
        onResidents={() => setPage("residents")}
        onDocumentRequests={() => setPage("document-requests")}
        onApprovals={() => setPage("approvals")}
        onDocumentManagement={() => setPage("document-management")}
        onNotifications={() => setPage("notifications")}
        onLogout={handleLogout}
      />
    );
  }

  if (page === "document-management" && isAdmin) {
    return (
      <AdminDocumentManagement
        user={user}
        unreadNotifications={unreadCount}
        onDashboard={() => setPage("dashboard")}
        onResidents={() => setPage("residents")}
        onDocumentRequests={() => setPage("document-requests")}
        onRequestHistory={() => setPage("admin-request-history")}
        onApprovals={() => setPage("approvals")}
        onNotifications={() => setPage("notifications")}
        onLogout={handleLogout}
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
