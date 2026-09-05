import type { AdminResident } from "../Types/AdminResidentsType";

export type ResidentsFiltersState = {
  search: string;
  purok: string;
  status: string;
};

export const DEFAULT_RESIDENTS_FILTERS: ResidentsFiltersState = {
  search: "",
  purok: "all",
  status: "all",
};

export type ResidentStatusMeta = {
  label: string;
  className: string;
};

const STATUS_META: Record<string, ResidentStatusMeta> = {
  active: { label: "Active", className: "status-active" },
  inactive: { label: "Inactive", className: "status-inactive" },
  suspended: { label: "Suspended", className: "status-suspended" },
};

export function getResidentStatusMeta(status: string): ResidentStatusMeta {
  return (
    STATUS_META[status] ?? { label: status, className: "status-active" }
  );
}

export function getUniquePuroks(residents: AdminResident[]): string[] {
  const puroks = residents
    .map((resident) => resident.purok?.trim())
    .filter((purok): purok is string => Boolean(purok));

  return Array.from(new Set(puroks)).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );
}

export function filterResidents(
  residents: AdminResident[],
  filters: ResidentsFiltersState,
): AdminResident[] {
  const search = filters.search.trim().toLowerCase();

  return residents.filter((resident) => {
    if (filters.purok !== "all" && resident.purok !== filters.purok) {
      return false;
    }

    if (filters.status !== "all" && resident.status !== filters.status) {
      return false;
    }

    if (search) {
      const haystack =
        `${resident.name} ${resident.email} ${resident.resident_code}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }

    return true;
  });
}

export function getResidentInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";

  return `${first}${last}`.toUpperCase() || "?";
}

export function getAvatarClass(index: number): string {
  const palette = ["1", "2", "3", "4", "5"];
  return `residents-avatar residents-avatar-${palette[index % palette.length]}`;
}

export function formatRegisteredDate(value: string): string {
  return value.slice(0, 10);
}

export function getRequestStatusMeta(status: string): ResidentStatusMeta {
  const normalized = status.trim().toLowerCase();
  const meta: Record<string, ResidentStatusMeta> = {
    pending: { label: "Pending", className: "status-pending" },
    processing: { label: "Processing", className: "status-processing" },
    "ready for pickup": {
      label: "Ready for Pickup",
      className: "status-ready",
    },
    completed: { label: "Completed", className: "status-completed" },
    rejected: { label: "Rejected", className: "status-rejected" },
  };

  return meta[normalized] ?? { label: status, className: "status-pending" };
}
