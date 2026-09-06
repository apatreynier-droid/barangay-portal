import type { Request, RequestStatus } from "../Types/DashboardType";

export const getRequests = (): Request[] => {
  return [];
};

export const getStatusClass = (status: RequestStatus): string => {
  switch (status) {
    case "Pending":
      return "status-pending";

    case "Approved":
      return "status-approved";

    case "Processing":
      return "status-processing";

    case "Ready for Pickup":
      return "status-ready";

    case "Completed":
      return "status-completed";

    case "Rejected":
      return "status-rejected";

    default:
      return "";
  }
};
