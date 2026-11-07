import {
  Ban,
  CheckCircle,
  Clock,
  LoaderCircle,
  XCircle,
  type LucideIcon,
} from "lucide-react";

/** Shared sizing so every Approvals icon renders consistently. */
const ACTION_ICON_SIZE = 16;
const STATUS_ICON_SIZE = 13;
const ICON_STROKE = 2;

type ActionIconProps = { isLoading?: boolean };

/** Leading icon for Approve buttons (spinner while the action is saving). */
export const ApproveIcon = ({ isLoading = false }: ActionIconProps) =>
  isLoading ? (
    <LoaderCircle
      className="approvals-icon-spin"
      size={ACTION_ICON_SIZE}
      strokeWidth={ICON_STROKE}
      aria-hidden="true"
    />
  ) : (
    <CheckCircle
      size={ACTION_ICON_SIZE}
      strokeWidth={ICON_STROKE}
      aria-hidden="true"
    />
  );

/** Leading icon for Reject buttons (spinner while the action is saving). */
export const RejectIcon = ({ isLoading = false }: ActionIconProps) =>
  isLoading ? (
    <LoaderCircle
      className="approvals-icon-spin"
      size={ACTION_ICON_SIZE}
      strokeWidth={ICON_STROKE}
      aria-hidden="true"
    />
  ) : (
    <XCircle
      size={ACTION_ICON_SIZE}
      strokeWidth={ICON_STROKE}
      aria-hidden="true"
    />
  );

/** Raw status values (registration statuses + document request "pending"). */
const STATUS_ICONS: Record<string, LucideIcon> = {
  pending: Clock,
  active: CheckCircle,
  approved: CheckCircle,
  rejected: XCircle,
  inactive: Ban,
  suspended: Ban,
};

type ApprovalStatusPillProps = {
  status: string;
  label: string;
  className: string;
};

/** The existing admin status pill with a matching Lucide status icon. */
export const ApprovalStatusPill = ({
  status,
  label,
  className,
}: ApprovalStatusPillProps) => {
  const Icon = STATUS_ICONS[status.toLowerCase()] ?? Clock;

  return (
    <span className={`admin-status-pill approvals-status-pill ${className}`}>
      <Icon size={STATUS_ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden="true" />
      {label}
    </span>
  );
};
