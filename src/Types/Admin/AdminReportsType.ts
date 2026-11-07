import type {
  AdminDocumentTypeCount,
  AdminPurokAnalytics,
  AdminResidentSummary,
  AdminStatusCount,
} from "./AdminDashboardType";

/** Interval of the report trends (one point per day/week/month/year). */
export type ReportGranularity = "daily" | "weekly" | "monthly" | "yearly";

/** Query sent to GET /api/admin/reports. Dates are Manila calendar days. */
export type AdminReportsQuery = {
  /** ISO yyyy-mm-dd, or "" for all time. */
  dateFrom: string;
  /** ISO yyyy-mm-dd, or "" for today. */
  dateTo: string;
  granularity: ReportGranularity;
};

/** The range the backend actually computed (open ends resolved). */
export type AdminReportsFilters = {
  date_from: string;
  date_to: string;
  granularity: ReportGranularity;
  is_all_time: boolean;
  days: number;
  timezone: string;
};

export type AdminReportsSummary = {
  total_residents: number;
  active_residents: number;
  total_requests: number;
  completed: number;
  rejected: number;
  completion_rate: number;
  rejection_rate: number;
  open_requests: number;
  new_registrations: number;
};

export type AdminReportsMonthlyPoint = {
  month: string;
  requests: number;
  completed: number;
  rejected: number;
};

export type AdminTrendPoint = {
  period_start: string;
  period_end: string;
  label: string;
  requests: number;
  completed: number;
  rejected: number;
};

export type AdminPurokCount = {
  purok: string;
  count: number;
};

export type AdminReportsExportRow = {
  request_number: string;
  resident_name: string;
  document: string;
  status: string;
  submitted_at: string;
};

export type AdminCompletionStats = {
  total_requests: number;
  completed: number;
  rejected: number;
  open_requests: number;
  completion_rate: number;
  rejection_rate: number;
  open_rate: number;
  completed_in_period: number;
  rejected_in_period: number;
};

export type AdminDurationStats = {
  count: number;
  average_hours: number | null;
  median_hours: number | null;
  min_hours: number | null;
  max_hours: number | null;
  p90_hours: number | null;
};

export type AdminStageDuration = {
  stage: string;
  from_status: string;
  to_status: string;
  count: number;
  average_hours: number | null;
  median_hours: number | null;
};

export type AdminDocumentTypeDuration = {
  document_name: string;
  count: number;
  average_hours: number | null;
  median_hours: number | null;
};

export type AdminProcessingTimeStats = {
  overall: AdminDurationStats;
  stages: AdminStageDuration[];
  by_document_type: AdminDocumentTypeDuration[];
  excluded_records: number;
};

export type AdminRegistrationPoint = {
  period_start: string;
  period_end: string;
  label: string;
  registrations: number;
  approved: number;
  pending: number;
  rejected: number;
};

export type AdminRegistrationStats = {
  total: number;
  approved: number;
  pending: number;
  rejected: number;
  trend: AdminRegistrationPoint[];
};

export type AdminComparisonMetric = {
  key: string;
  label: string;
  current: number;
  previous: number;
  change: number;
  change_percentage: number | null;
};

export type AdminPeriodComparison = {
  previous_from: string;
  previous_to: string;
  metrics: AdminComparisonMetric[];
};

export type AdminPotholeStatusShare = {
  status: string;
  label: string;
  count: number;
  percentage: number;
};

export type AdminPotholeRoadCount = {
  road_name: string;
  count: number;
  percentage: number;
};

export type AdminPotholeTrendPoint = {
  period_start: string;
  period_end: string;
  label: string;
  reported: number;
  resolved: number;
};

export type AdminPotholeAnalytics = {
  available: boolean;
  total: number;
  resolved: number;
  unresolved: number;
  rejected: number;
  resolution_rate: number;
  by_status: AdminPotholeStatusShare[];
  by_purok: AdminPurokCount[];
  unspecified_purok: number;
  by_road: AdminPotholeRoadCount[];
  trend: AdminPotholeTrendPoint[];
};

export type AdminReportsData = {
  filters: AdminReportsFilters;
  summary: AdminReportsSummary;
  resident_summary: AdminResidentSummary;
  monthly: AdminReportsMonthlyPoint[];
  trend: AdminTrendPoint[];
  residents_by_purok: AdminPurokCount[];
  purok_distribution: AdminPurokAnalytics[];
  document_types: AdminDocumentTypeCount[];
  status_breakdown: AdminStatusCount[];
  completion: AdminCompletionStats;
  processing_time: AdminProcessingTimeStats;
  registrations: AdminRegistrationStats;
  comparison: AdminPeriodComparison | null;
  potholes: AdminPotholeAnalytics;
  export_requests: AdminReportsExportRow[];
  generated_at: string;
};
