export type RequestStatus =
  | "Pending"
  | "Approved"
  | "Processing"
  | "Ready for Pickup"
  | "Completed"
  | "Rejected";

export interface MyRequest {
  id: string;
  document: string;
  submittedDate: string;
  updatedDate: string;
  status: RequestStatus;
  purpose: string;
  pickupDate?: string;
}
