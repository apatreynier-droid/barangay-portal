import { useCallback, useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import LoginPage from "./Pages/Login/LoginPage";
import CreateAccount from "./Pages/CreateAccount/CreateAccount";
import Dashboard from "./Pages/Dashboard/Dashboard";
import AdminDashboard from "./Pages/AdminDashboard/AdminDashboard";
import AdminResidents from "./Pages/AdminResidents/AdminResidents";
import AdminDocumentRequests from "./Pages/AdminDocumentRequests/AdminDocumentRequests";
import AdminRequestHistory from "./Pages/AdminRequestHistory/AdminRequestHistory";
import AdminDocumentManagement from "./Pages/AdminDocumentManagement/AdminDocumentManagement";
import AdminApprovals from "./Pages/AdminApprovals/AdminApprovals";
import AdminReports from "./Pages/AdminReports/AdminReports";
import AdminLogs from "./Pages/AdminLogs/AdminLogs";
import AdminUserManagement from "./Pages/AdminUserManagement/AdminUserManagement";
import AdminNotification from "./Pages/AdminNotification/AdminNotification";
import MyRequests from "./Pages/MyRequests/MyRequests";
import RequestHistory from "./Pages/RequestHistory/RequestHistory";
import NotificationPage from "./Pages/Notification/NotificationPage";
import RequestDocumentPage from "./Pages/RequestDocument/RequestDocumentPage";
import PotholeDetection from "./Pages/PotholeDetection/PotholeDetection";
import ForgotPasswordPage from "./Pages/ForgotPassword/ForgotPasswordPage";
import ResetPasswordPage from "./Pages/ResetPassword/ResetPasswordPage";
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
import {
  ADMIN_APPROVALS_PATH,
  ADMIN_DOCUMENT_MANAGEMENT_PATH,
  ADMIN_DOCUMENT_REQUESTS_PATH,
  ADMIN_HOME_PATH,
  ADMIN_REQUEST_HISTORY_PATH,
  ADMIN_REPORTS_PATH,
  ADMIN_RESIDENTS_PATH,
  ADMIN_ACTIVITY_LOGS_PATH,
  ADMIN_USER_MANAGEMENT_PATH,
  CREATE_ACCOUNT_PATH,
  FORGOT_PASSWORD_PATH,
  getHomePath,
  isAdminPortalUser,
  LEGACY_RESIDENT_HOME_PATH,
  LOGIN_PATH,
  NOTIFICATIONS_PATH,
  RESIDENT_HOME_PATH,
  RESIDENT_MY_REQUESTS_PATH,
  RESIDENT_REQUEST_DOCUMENT_PATH,
  RESIDENT_REQUEST_HISTORY_PATH,
  RESET_PASSWORD_PATH,
  POTHOLE_DETECTION_PATH,
} from "./Utils/routePaths";
import {
  HomeRoute,
  PublicOnly,
  RequireAdministrator,
  RequireAdminPortal,
  RequireAuth,
  RequireResident,
} from "./Utils/guards";

function App() {
  return (
    <BrowserRouter>
      <PortalRoutes />
    </BrowserRouter>
  );
}

/**
 * How often the notification list is re-read from GET /api/notifications while
 * a user is signed in. Residents and administrators are usually signed in in
 * different windows, so polling is what makes a notification created by one
 * person show up for the other without a page reload.
 */
const NOTIFICATION_REFRESH_MS = 30000;

function PortalRoutes() {
  const navigate = useNavigate();
  const [user, setUser] = useState<AuthUser | null>(getSessionUser);
  const [requests, setRequests] = useState<Request[]>([]);
  const [notifications, setNotifications] = useState<ApiNotification[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [dataError, setDataError] = useState("");

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

  const refreshNotifications = useCallback(async () => {
    try {
      setNotifications(await fetchNotifications());
    } catch {
      // Background refresh only: a transient failure must not disturb the page
      // the user is looking at (the badge simply keeps its last value).
    }
  }, []);

  useEffect(() => {
    if (user) {
      void loadUserData();
    }
  }, [user, loadUserData]);

  useEffect(() => {
    if (!user) {
      return;
    }

    const timer = window.setInterval(() => {
      void refreshNotifications();
    }, NOTIFICATION_REFRESH_MS);
    const handleWindowFocus = () => {
      void refreshNotifications();
    };
    window.addEventListener("focus", handleWindowFocus);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, [user, refreshNotifications]);

  const handleRequestCreated = () => {
    void loadUserData();
    navigate(RESIDENT_MY_REQUESTS_PATH);
  };

  const handleLogout = () => {
    void logoutUser();
    setUser(null);
    setRequests([]);
    setNotifications([]);
    navigate(LOGIN_PATH, { replace: true });
  };

  const handleSessionExpired = () => {
    clearSession();
    setUser(null);
    setRequests([]);
    setNotifications([]);
    navigate(LOGIN_PATH, { replace: true });
  };

  const unreadCount = user
    ? notifications.filter((notification) => !notification.is_read).length
    : 0;

  return (
    <Routes>
      <Route path="/" element={<HomeRoute user={user} />} />
      <Route path="*" element={<HomeRoute user={user} />} />

      {/* Old resident dashboard URL: send visitors to the new address.
          The role guards on the new route still apply after redirect. */}
      <Route
        path={LEGACY_RESIDENT_HOME_PATH}
        element={<Navigate to={RESIDENT_HOME_PATH} replace />}
      />

      <Route
        path={LOGIN_PATH}
        element={
          <PublicOnly user={user}>
            <LoginPage
              onLoginSuccess={() => setUser(getSessionUser())}
              onCreateAccount={() => navigate(CREATE_ACCOUNT_PATH)}
              onForgotPassword={() => navigate(FORGOT_PASSWORD_PATH)}
            />
          </PublicOnly>
        }
      />

      <Route
        path={CREATE_ACCOUNT_PATH}
        element={
          <PublicOnly user={user}>
            <CreateAccount onBackToLogin={() => navigate(LOGIN_PATH)} />
          </PublicOnly>
        }
      />

      <Route
        path={FORGOT_PASSWORD_PATH}
        element={
          <PublicOnly user={user}>
            <ForgotPasswordPage onBackToLogin={() => navigate(LOGIN_PATH)} />
          </PublicOnly>
        }
      />

      {/* Target of the link inside the password-reset email. Reachable while
          signed out on purpose (the token itself is validated by the API). */}
      <Route
        path={RESET_PASSWORD_PATH}
        element={
          <ResetPasswordPage
            onBackToLogin={() => navigate(LOGIN_PATH)}
            onRequestNewLink={() => navigate(FORGOT_PASSWORD_PATH)}
          />
        }
      />

      <Route
        path={RESIDENT_HOME_PATH}
        element={
          <RequireResident user={user}>
            {(authUser) => (
              <Dashboard
                user={authUser}
                requests={requests}
                notifications={notifications}
                isLoadingData={isLoadingData}
                dataError={dataError}
                onRetry={() => void loadUserData()}
                onMyRequests={() => navigate(RESIDENT_MY_REQUESTS_PATH)}
                onNotifications={() => navigate(NOTIFICATIONS_PATH)}
                onRequestDocument={() =>
                  navigate(RESIDENT_REQUEST_DOCUMENT_PATH)
                }
                onLogout={handleLogout}
              />
            )}
          </RequireResident>
        }
      />

      <Route
        path={RESIDENT_MY_REQUESTS_PATH}
        element={
          <RequireResident user={user}>
            {(authUser) => (
              <MyRequests
                user={authUser}
                requests={requests}
                isLoadingData={isLoadingData}
                dataError={dataError}
                onRetry={() => void loadUserData()}
                onBackToDashboard={() => navigate(RESIDENT_HOME_PATH)}
                onMyRequests={() => navigate(RESIDENT_MY_REQUESTS_PATH)}
                onRequestHistory={() => navigate(RESIDENT_REQUEST_HISTORY_PATH)}
                onNotifications={() => navigate(NOTIFICATIONS_PATH)}
                onRequestDocument={() =>
                  navigate(RESIDENT_REQUEST_DOCUMENT_PATH)
                }
                onLogout={handleLogout}
              />
            )}
          </RequireResident>
        }
      />

      <Route
        path={RESIDENT_REQUEST_HISTORY_PATH}
        element={
          <RequireResident user={user}>
            {(authUser) => (
              <RequestHistory
                user={authUser}
                requests={requests}
                isLoadingData={isLoadingData}
                dataError={dataError}
                onRetry={() => void loadUserData()}
                onBackToDashboard={() => navigate(RESIDENT_HOME_PATH)}
                onMyRequests={() => navigate(RESIDENT_MY_REQUESTS_PATH)}
                onNotifications={() => navigate(NOTIFICATIONS_PATH)}
                onRequestDocument={() =>
                  navigate(RESIDENT_REQUEST_DOCUMENT_PATH)
                }
                onLogout={handleLogout}
              />
            )}
          </RequireResident>
        }
      />

      <Route
        path={RESIDENT_REQUEST_DOCUMENT_PATH}
        element={
          <RequireResident user={user}>
            {(authUser) => (
              <RequestDocumentPage
                user={authUser}
                onBackToDashboard={() => navigate(RESIDENT_HOME_PATH)}
                onMyRequests={() => navigate(RESIDENT_MY_REQUESTS_PATH)}
                onRequestHistory={() => navigate(RESIDENT_REQUEST_HISTORY_PATH)}
                onNotifications={() => navigate(NOTIFICATIONS_PATH)}
                onRequestSubmitted={handleRequestCreated}
                onSessionExpired={handleSessionExpired}
                onLogout={handleLogout}
              />
            )}
          </RequireResident>
        }
      />

      <Route
        path={POTHOLE_DETECTION_PATH}
        element={
          <RequireResident user={user}>
            {(authUser) => (
              <PotholeDetection
                user={authUser}
                onBackToDashboard={() => navigate(RESIDENT_HOME_PATH)}
                onLogout={handleLogout}
              />
            )}
          </RequireResident>
        }
      />

      <Route
        path={NOTIFICATIONS_PATH}
        element={
          <RequireAuth user={user}>
            {(authUser) =>
              isAdminPortalUser(authUser) ? (
                <AdminNotification
                  user={authUser}
                  notifications={notifications}
                  unreadNotifications={unreadCount}
                  onUserManagement={() => navigate(ADMIN_USER_MANAGEMENT_PATH)}
                  onNotificationsChanged={loadUserData}
                  onSessionExpired={handleSessionExpired}
                  onDashboard={() => navigate(ADMIN_HOME_PATH)}
                  onResidents={() => navigate(ADMIN_RESIDENTS_PATH)}
                  onDocumentRequests={() =>
                    navigate(ADMIN_DOCUMENT_REQUESTS_PATH)
                  }
                  onRequestHistory={() =>
                    navigate(ADMIN_REQUEST_HISTORY_PATH)
                  }
                  onApprovals={() => navigate(ADMIN_APPROVALS_PATH)}
                  onDocumentManagement={() =>
                    navigate(ADMIN_DOCUMENT_MANAGEMENT_PATH)
                  }
                  onReports={() => navigate(ADMIN_REPORTS_PATH)}
                  onActivityLogs={() => navigate(ADMIN_ACTIVITY_LOGS_PATH)}
                  onLogout={handleLogout}
                />
              ) : (
                <NotificationPage
                  user={authUser}
                  notifications={notifications}
                  onNotificationsChanged={loadUserData}
                  onSessionExpired={handleSessionExpired}
                  onBackToDashboard={() => navigate(getHomePath(user))}
                  onMyRequests={() => navigate(RESIDENT_MY_REQUESTS_PATH)}
                  onRequestHistory={() =>
                    navigate(RESIDENT_REQUEST_HISTORY_PATH)
                  }
                  onRequestDocument={() =>
                    navigate(RESIDENT_REQUEST_DOCUMENT_PATH)
                  }
                  onLogout={handleLogout}
                />
              )
            }
          </RequireAuth>
        }
      />

      <Route
        path={ADMIN_HOME_PATH}
        element={
          <RequireAdminPortal user={user}>
            {(authUser) => (
              <AdminDashboard
                user={authUser}
                unreadNotifications={unreadCount}
                notifications={notifications}
                onUserManagement={() => navigate(ADMIN_USER_MANAGEMENT_PATH)}
                onReports={() => navigate(ADMIN_REPORTS_PATH)}
                onActivityLogs={() => navigate(ADMIN_ACTIVITY_LOGS_PATH)}
                onNotifications={() => navigate(NOTIFICATIONS_PATH)}
                onResidents={() => navigate(ADMIN_RESIDENTS_PATH)}
                onDocumentRequests={() =>
                  navigate(ADMIN_DOCUMENT_REQUESTS_PATH)
                }
                onRequestHistory={() => navigate(ADMIN_REQUEST_HISTORY_PATH)}
                onApprovals={() => navigate(ADMIN_APPROVALS_PATH)}
                onDocumentManagement={() =>
                  navigate(ADMIN_DOCUMENT_MANAGEMENT_PATH)
                }
                onOpenRequest={(requestNumber) =>
                  navigate(ADMIN_DOCUMENT_REQUESTS_PATH, {
                    state: { requestNumber },
                  })
                }
                onLogout={handleLogout}
              />
            )}
          </RequireAdminPortal>
        }
      />

      <Route
        path={ADMIN_RESIDENTS_PATH}
        element={
          <RequireAdminPortal user={user}>
            {(authUser) => (
              <AdminResidents
                user={authUser}
                unreadNotifications={unreadCount}
                onUserManagement={() => navigate(ADMIN_USER_MANAGEMENT_PATH)}
                onDashboard={() => navigate(ADMIN_HOME_PATH)}
                onReports={() => navigate(ADMIN_REPORTS_PATH)}
                onActivityLogs={() => navigate(ADMIN_ACTIVITY_LOGS_PATH)}
                onDocumentRequests={() =>
                  navigate(ADMIN_DOCUMENT_REQUESTS_PATH)
                }
                onRequestHistory={() => navigate(ADMIN_REQUEST_HISTORY_PATH)}
                onApprovals={() => navigate(ADMIN_APPROVALS_PATH)}
                onDocumentManagement={() =>
                  navigate(ADMIN_DOCUMENT_MANAGEMENT_PATH)
                }
                onNotifications={() => navigate(NOTIFICATIONS_PATH)}
                onLogout={handleLogout}
              />
            )}
          </RequireAdminPortal>
        }
      />

      <Route
        path={ADMIN_APPROVALS_PATH}
        element={
          <RequireAdministrator user={user}>
            {(authUser) => (
              <AdminApprovals
                user={authUser}
                unreadNotifications={unreadCount}
                onUserManagement={() => navigate(ADMIN_USER_MANAGEMENT_PATH)}
                onDashboard={() => navigate(ADMIN_HOME_PATH)}
                onResidents={() => navigate(ADMIN_RESIDENTS_PATH)}
                onReports={() => navigate(ADMIN_REPORTS_PATH)}
                onActivityLogs={() => navigate(ADMIN_ACTIVITY_LOGS_PATH)}
                onDocumentRequests={() =>
                  navigate(ADMIN_DOCUMENT_REQUESTS_PATH)
                }
                onRequestHistory={() => navigate(ADMIN_REQUEST_HISTORY_PATH)}
                onDocumentManagement={() =>
                  navigate(ADMIN_DOCUMENT_MANAGEMENT_PATH)
                }
                onNotifications={() => navigate(NOTIFICATIONS_PATH)}
                onLogout={handleLogout}
              />
            )}
          </RequireAdministrator>
        }
      />

      <Route
        path={ADMIN_DOCUMENT_REQUESTS_PATH}
        element={
          <RequireAdminPortal user={user}>
            {(authUser) => (
              <AdminDocumentRequests
                user={authUser}
                unreadNotifications={unreadCount}
                onUserManagement={() => navigate(ADMIN_USER_MANAGEMENT_PATH)}
                onDashboard={() => navigate(ADMIN_HOME_PATH)}
                onResidents={() => navigate(ADMIN_RESIDENTS_PATH)}
                onReports={() => navigate(ADMIN_REPORTS_PATH)}
                onActivityLogs={() => navigate(ADMIN_ACTIVITY_LOGS_PATH)}
                onNotifications={() => navigate(NOTIFICATIONS_PATH)}
                onRequestHistory={() => navigate(ADMIN_REQUEST_HISTORY_PATH)}
                onApprovals={() => navigate(ADMIN_APPROVALS_PATH)}
                onDocumentManagement={() =>
                  navigate(ADMIN_DOCUMENT_MANAGEMENT_PATH)
                }
                onLogout={handleLogout}
              />
            )}
          </RequireAdminPortal>
        }
      />

      <Route
        path={ADMIN_REQUEST_HISTORY_PATH}
        element={
          <RequireAdminPortal user={user}>
            {(authUser) => (
              <AdminRequestHistory
                user={authUser}
                unreadNotifications={unreadCount}
                onUserManagement={() => navigate(ADMIN_USER_MANAGEMENT_PATH)}
                onDashboard={() => navigate(ADMIN_HOME_PATH)}
                onResidents={() => navigate(ADMIN_RESIDENTS_PATH)}
                onDocumentRequests={() =>
                  navigate(ADMIN_DOCUMENT_REQUESTS_PATH)
                }
                onReports={() => navigate(ADMIN_REPORTS_PATH)}
                onActivityLogs={() => navigate(ADMIN_ACTIVITY_LOGS_PATH)}
                onApprovals={() => navigate(ADMIN_APPROVALS_PATH)}
                onDocumentManagement={() =>
                  navigate(ADMIN_DOCUMENT_MANAGEMENT_PATH)
                }
                onNotifications={() => navigate(NOTIFICATIONS_PATH)}
                onLogout={handleLogout}
              />
            )}
          </RequireAdminPortal>
        }
      />

      <Route
        path={ADMIN_DOCUMENT_MANAGEMENT_PATH}
        element={
          <RequireAdminPortal user={user}>
            {(authUser) => (
              <AdminDocumentManagement
                user={authUser}
                unreadNotifications={unreadCount}
                onUserManagement={() => navigate(ADMIN_USER_MANAGEMENT_PATH)}
                onDashboard={() => navigate(ADMIN_HOME_PATH)}
                onResidents={() => navigate(ADMIN_RESIDENTS_PATH)}
                onDocumentRequests={() =>
                  navigate(ADMIN_DOCUMENT_REQUESTS_PATH)
                }
                onReports={() => navigate(ADMIN_REPORTS_PATH)}
                onActivityLogs={() => navigate(ADMIN_ACTIVITY_LOGS_PATH)}
                onRequestHistory={() => navigate(ADMIN_REQUEST_HISTORY_PATH)}
                onApprovals={() => navigate(ADMIN_APPROVALS_PATH)}
                onNotifications={() => navigate(NOTIFICATIONS_PATH)}
                onLogout={handleLogout}
              />
            )}
          </RequireAdminPortal>
        }
      />

      <Route
        path={ADMIN_ACTIVITY_LOGS_PATH}
        element={
          <RequireAdministrator user={user}>
            {(authUser) => (
              <AdminLogs
                user={authUser}
                unreadNotifications={unreadCount}
                onUserManagement={() => navigate(ADMIN_USER_MANAGEMENT_PATH)}
                onDashboard={() => navigate(ADMIN_HOME_PATH)}
                onResidents={() => navigate(ADMIN_RESIDENTS_PATH)}
                onDocumentRequests={() =>
                  navigate(ADMIN_DOCUMENT_REQUESTS_PATH)
                }
                onRequestHistory={() => navigate(ADMIN_REQUEST_HISTORY_PATH)}
                onApprovals={() => navigate(ADMIN_APPROVALS_PATH)}
                onDocumentManagement={() =>
                  navigate(ADMIN_DOCUMENT_MANAGEMENT_PATH)
                }
                onReports={() => navigate(ADMIN_REPORTS_PATH)}
                onNotifications={() => navigate(NOTIFICATIONS_PATH)}
                onLogout={handleLogout}
              />
            )}
          </RequireAdministrator>
        }
      />

      <Route
        path={ADMIN_USER_MANAGEMENT_PATH}
        element={
          <RequireAdministrator user={user}>
            {(authUser) => (
              <AdminUserManagement
                user={authUser}
                unreadNotifications={unreadCount}
                onDashboard={() => navigate(ADMIN_HOME_PATH)}
                onResidents={() => navigate(ADMIN_RESIDENTS_PATH)}
                onDocumentRequests={() =>
                  navigate(ADMIN_DOCUMENT_REQUESTS_PATH)
                }
                onRequestHistory={() => navigate(ADMIN_REQUEST_HISTORY_PATH)}
                onApprovals={() => navigate(ADMIN_APPROVALS_PATH)}
                onDocumentManagement={() =>
                  navigate(ADMIN_DOCUMENT_MANAGEMENT_PATH)
                }
                onReports={() => navigate(ADMIN_REPORTS_PATH)}
                onActivityLogs={() => navigate(ADMIN_ACTIVITY_LOGS_PATH)}
                onNotifications={() => navigate(NOTIFICATIONS_PATH)}
                onLogout={handleLogout}
              />
            )}
          </RequireAdministrator>
        }
      />

      <Route
        path={ADMIN_REPORTS_PATH}
        element={
          <RequireAdministrator user={user}>
            {(authUser) => (
              <AdminReports
                user={authUser}
                unreadNotifications={unreadCount}
                onUserManagement={() => navigate(ADMIN_USER_MANAGEMENT_PATH)}
                onDashboard={() => navigate(ADMIN_HOME_PATH)}
                onResidents={() => navigate(ADMIN_RESIDENTS_PATH)}
                onDocumentRequests={() =>
                  navigate(ADMIN_DOCUMENT_REQUESTS_PATH)
                }
                onRequestHistory={() => navigate(ADMIN_REQUEST_HISTORY_PATH)}
                onApprovals={() => navigate(ADMIN_APPROVALS_PATH)}
                onDocumentManagement={() =>
                  navigate(ADMIN_DOCUMENT_MANAGEMENT_PATH)
                }
                onActivityLogs={() => navigate(ADMIN_ACTIVITY_LOGS_PATH)}
                onNotifications={() => navigate(NOTIFICATIONS_PATH)}
                onLogout={handleLogout}
              />
            )}
          </RequireAdministrator>
        }
      />
    </Routes>
  );
}

export default App;


