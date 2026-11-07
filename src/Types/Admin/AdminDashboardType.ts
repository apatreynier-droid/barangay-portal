/**
 * Dashboard counters computed by the backend analytics service
 * (backend/app/analytics.py). `pending`/`approved`/`processing`/
 * `ready_for_pickup` are requests currently in that exact status;
 * `completed`/`rejected` are this month's (Manila time) and the
 * `*_all_time` fields are the all-time totals.
 */
export type AdminStats = {
  total_residents: number;
  new_residents_this_month: number;
  total_requests: number;
  pending: number;
  approved: number;
  processing: number;
  ready_for_pickup: number;
  completed: number;
  rejected: number;
  completed_all_time: number;
  rejected_all_time: number;
  pending_registrations: number;
};

export type AdminMonthlyDataPoint = {
  month: string;
  submitted: number;
  completed: number;
  rejected: number;
};

export type AdminDocumentTypeCount = {
  document_name: string;
  count: number;
  /** Share of all requests in the same scope (0-100). */
  percentage?: number;
};

/** Resident accounts by status (current snapshot). */
export type AdminResidentSummary = {
  /** Approved resident accounts: active + deactivated. */
  total_registered: number;
  active: number;
  deactivated: number;
  pending: number;
  rejected: number;
  /** Every resident sign-up, including pending and rejected. */
  total_accounts: number;
};

export type AdminStatusCount = {
  status: string;
  count: number;
  percentage: number;
};

/** One Purok compared on residents, requests (and pothole reports). */
export type AdminPurokAnalytics = {
  purok: string;
  /** False for the "Not specified" bucket. */
  is_standardized: boolean;
  residents: number;
  resident_percentage: number;
  requests: number;
  request_percentage: number;
  requests_per_resident: number | null;
  potholes?: number | null;
};

export type AdminYearlyPoint = {
  year: number;
  requests: number;
  completed: number;
  rejected: number;
  change_percentage: number | null;
};

export type AdminRecentRequest = {
  request_number: string;
  resident_name: string;
  document: string;
  status: string;
  submitted_at: string;
};

export type AdminRecentRegistration = {
  resident_name: string;
  created_at: string;
  status: string;
};

export type AdminActivityEntry = {
  title: string;
  created_at: string;
};

export type AdminDashboardData = {
  stats: AdminStats;
  monthly: AdminMonthlyDataPoint[];
  document_types: AdminDocumentTypeCount[];
  recent_requests: AdminRecentRequest[];
  recent_registrations: AdminRecentRegistration[];
  recent_activity: AdminActivityEntry[];
  resident_summary: AdminResidentSummary;
  request_status: AdminStatusCount[];
  yearly: AdminYearlyPoint[];
  purok_distribution: AdminPurokAnalytics[];
  generated_at: string;
};
