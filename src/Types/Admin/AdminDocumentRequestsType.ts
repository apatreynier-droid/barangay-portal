export type AdminDocumentRequest = {
  id: number;
  request_number: string;
  resident_name: string;
  document: string;
  purpose: string;
  status: string;
  submitted_at: string;
  fee: number;
};

/** Metadata of the resident's image (bytes come from the attachment endpoint). */
export type AdminRequestAttachment = {
  id: number;
  original_filename: string;
  content_type: string;
  file_size: number;
  uploaded_at: string;
};

export type AdminDocumentRequestDetail = {
  id: number;
  request_number: string;
  resident_name: string;
  email: string;
  document: string;
  purpose: string;
  status: string;
  admin_remarks: string | null;
  submitted_at: string;
  last_updated: string;
  pickup_date: string | null;
  /** Time of day for pickup ("09:30:00"); null when not set. */
  pickup_time: string | null;
  fee: number;
  processed_by: string | null;
  /** Null for requests submitted without an image (e.g. older requests). */
  attachment?: AdminRequestAttachment | null;
};

export type AdminDocumentRequestActionPayload = {
  status?: string;
  admin_remarks?: string;
  pickup_date?: string;
  /** "HH:MM"; needs a pickup date (sent together or already saved). */
  pickup_time?: string;
};
