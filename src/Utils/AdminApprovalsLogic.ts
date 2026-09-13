import type { AdminDocumentRequest } from "../Types/AdminDocumentRequestsType";

export const PENDING_STATUS = "Pending";

export function isPendingApproval(request: AdminDocumentRequest): boolean {
  return request.status.trim().toLowerCase() === PENDING_STATUS.toLowerCase();
}

export function getPendingApprovals(
  requests: AdminDocumentRequest[],
): AdminDocumentRequest[] {
  return requests.filter(isPendingApproval);
}

export function removeRequestById(
  requests: AdminDocumentRequest[],
  requestId: number,
): AdminDocumentRequest[] {
  return requests.filter((request) => request.id !== requestId);
}
