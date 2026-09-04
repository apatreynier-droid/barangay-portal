export type RequestStatus =
  | "Pending"
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
