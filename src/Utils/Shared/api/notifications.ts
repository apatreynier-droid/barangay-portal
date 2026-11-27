/** Notifications and their read state. */

import { ApiError, authedFetch, parseErrorMessage } from "./client";

export type ApiNotification = {
  id: number;
  title: string;
  message: string;
  notification_type: string;
  related_request_id: number | null;
  is_read: boolean;
  created_at: string;
};

export const fetchNotifications = async (): Promise<ApiNotification[]> => {
  const response = await authedFetch("/api/notifications");
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      response.status,
      parseErrorMessage(body, "Could not load your notifications."),
    );
  }

  return (body as ApiNotification[]) ?? [];
};

export const markNotificationRead = async (id: number): Promise<void> => {
  const response = await authedFetch(`/api/notifications/${id}/read`, {
    method: "PATCH",
  });

  if (!response.ok) {
    throw new ApiError(
      response.status,
      "Could not mark the notification as read.",
    );
  }
};

export const markAllNotificationsRead = async (): Promise<void> => {
  const response = await authedFetch("/api/notifications/read-all", {
    method: "POST",
  });

  if (!response.ok) {
    throw new ApiError(
      response.status,
      "Could not mark your notifications as read.",
    );
  }
};
