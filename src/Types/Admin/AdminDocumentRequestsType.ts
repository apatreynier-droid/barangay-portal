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
  fee: number;
  processed_by: string | null;
};

export type AdminDocumentRequestActionPayload = {
  status?: string;
  admin_remarks?: string;
  pickup_date?: string;
};
