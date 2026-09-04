export type AdminStats = {
  total_residents: number;
  new_residents_this_month: number;
  pending: number;
  approved: number;
  processing: number;
  completed: number;
  rejected: number;
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
};
