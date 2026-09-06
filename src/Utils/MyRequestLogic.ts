import type { MyRequest, RequestStatus } from "../Types/MyRequestType";

export const getMyRequests = (): MyRequest[] => {
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

export const getStatusIcon = (status: RequestStatus): string => {
  switch (status) {
    case "Pending":
      return "⏳";

    case "Approved":
      return "✓";

    case "Processing":
      return "⚙";

    case "Ready for Pickup":
      return "✓";

    case "Completed":
      return "✓";

    case "Rejected":
      return "✕";

    default:
      return "•";
  }
};
