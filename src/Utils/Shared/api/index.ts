/**
 * Calls to the FastAPI backend, one file per feature.
 *
 * Import from "Utils/Shared/api"; this file lists what is public.
 */

export type {
  AuthUser,
  AuthResponse,
} from "./client";

export {
  TOKEN_STORAGE_KEY,
  USER_STORAGE_KEY,
  ApiError,
  getSessionUser,
  getSessionToken,
  clearSession,
} from "./client";

export type {
  RegistrationResult,
  RegisterPayload,
} from "./auth";

export {
  registerUser,
  loginUser,
  logoutUser,
  requestPasswordResetEmail,
  confirmPasswordReset,
} from "./auth";

export type {
  ApiRequest,
  DocumentTypeOption,
  DashboardSummary,
  RequestStatusHistoryEntry,
  RequestDetail,
} from "./requests";

export {
  fetchDashboardSummary,
  fetchRequests,
  fetchRequestDetail,
  createDocumentRequest,
  createDocumentRequestWithAttachment,
  updateDocumentRequest,
  deleteDocumentRequest,
  fetchDocumentTypes,
  mapApiRequest,
} from "./requests";

export {
  fetchAdminDocumentRequests,
  fetchAdminRequestHistory,
  fetchAdminDocumentRequestDetail,
  updateAdminDocumentRequest,
  fetchAdminRequestAttachment,
} from "./adminRequests";

export {
  fetchAdminDashboard,
  fetchAdminReports,
  fetchActivityLogs,
} from "./adminReports";

export {
  fetchResidents,
  fetchResidentDetail,
  updateResident,
  updateResidentStatus,
} from "./residents";

export {
  fetchStaffAccounts,
  createStaffAccount,
  updateStaffAccount,
  updateStaffAccountStatus,
  resetStaffPassword,
} from "./staff";

export {
  fetchRegistrations,
  approveRegistration,
  rejectRegistration,
  retryRegistrationEmail,
} from "./registrations";

export {
  submitPotholeReport,
  fetchMyPotholeReports,
  fetchAdminPotholeReports,
  fetchAdminPotholeSummary,
  fetchAdminPotholeReport,
  fetchAdminPotholePhoto,
  fetchMyPotholePhoto,
  updateAdminPotholeStatus,
  setAdminPotholeDuplicate,
  retryAdminPotholeDetection,
  addAdminPotholeRemark,
} from "./potholes";

export type {
  ApiNotification,
} from "./notifications";

export {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "./notifications";
