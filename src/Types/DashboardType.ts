// Types/DashboardType.ts
export type RequestStatus =
  | "Pending"
  | "Processing"
  | "Ready for Pickup"
  | "Completed"
  | "Rejected";

export interface Request {
  id: string;
  numericId: number;
  document: string;
  submittedDate: string;
  updatedDate: string;
  status: RequestStatus;
  purpose: string;
  pickupDate?: string;
}
