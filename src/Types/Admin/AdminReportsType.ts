import type { AdminDocumentTypeCount } from "./AdminDashboardType";

export type AdminReportsSummary = {
  total_residents: number;
  active_residents: number;
  total_requests: number;
  completed: number;
  rejected: number;
  completion_rate: number;
  rejection_rate: number;
};

export type AdminReportsMonthlyPoint = {
  month: string;
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

export type AdminReportsData = {
  summary: AdminReportsSummary;
  monthly: AdminReportsMonthlyPoint[];
  residents_by_purok: AdminPurokCount[];
  document_types: AdminDocumentTypeCount[];
  export_requests: AdminReportsExportRow[];
};
