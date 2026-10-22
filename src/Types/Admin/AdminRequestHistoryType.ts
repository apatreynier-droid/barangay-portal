export type AdminRequestHistoryEntry = {
  id: number;
  request_number: string;
  resident_name: string;
  document: string;
  status: string;
  submitted_at: string;
  processed_by: string | null;
};
