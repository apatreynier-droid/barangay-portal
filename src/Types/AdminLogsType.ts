export type AdminActivityLogActionType =
  | "Approve"
  | "Reject"
  | "Status"
  | "Update"
  | "Create"
  | "Login"
  | "Delete";

export type AdminActivityLog = {
  id: number;
  actor_name: string;
  actor_role: string;
  action_type: AdminActivityLogActionType;
  action: string;
  target_type: string;
  target: string;
  ip_address: string | null;
  created_at: string;
};