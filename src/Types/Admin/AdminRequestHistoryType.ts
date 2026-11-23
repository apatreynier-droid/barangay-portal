export type AdminRequestHistoryEntry = {
  id: number;
  request_number: string;
  resident_name: string;
  document: string;
  status: string;
  submitted_at: string;
  processed_by: string | null;
  // Resident details used to fill in issued documents (e.g. Business Permit).
  resident_first_name?: string | null;
  resident_middle_name?: string | null;
  resident_last_name?: string | null;
  resident_suffix?: string | null;
  civil_status?: string | null;
  nationality?: string | null;
  date_of_birth?: string | null;
  purok?: string | null;
  years_of_residency?: number | null;
  place_of_birth?: string | null;
  sex?: string | null;
  purpose?: string | null;
  /** Fee of the requested document type. */
  fee?: number | null;
};
