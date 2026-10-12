import { defaultStatuses } from "../domain/status";
import type { CaseStatus, CaseStatusId } from "../types";

export function StatusBadge({ status, statuses = defaultStatuses }: { status: CaseStatusId; statuses?: CaseStatus[] }) {
  const statusMeta = statuses.find((item) => item.id === status) ?? {
    label: String(status),
    color: "#667085",
  };
  return (
    <span className="status-badge" style={{ "--status-color": statusMeta.color } as React.CSSProperties}>
      <span aria-hidden="true" />
      {statusMeta.label}
    </span>
  );
}
