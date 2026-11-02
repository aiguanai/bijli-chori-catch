import { Check, Clock, X } from "@phosphor-icons/react/dist/ssr";
import type { PlanStatus } from "@/lib/api";

const LOOK = {
  approved: { label: "Approved", color: "var(--ok)", Icon: Check, tilt: -3 },
  rejected: { label: "Rejected", color: "var(--ink-2)", Icon: X, tilt: 2 },
  pending: { label: "Pending", color: "var(--amber)", Icon: Clock, tilt: 0 },
} as const;

/** Status as a rubber stamp: icon and word, so it never relies on colour. */
export function Stamp({ status }: { status: PlanStatus }) {
  const { label, color, Icon, tilt } = LOOK[status];
  return (
    <span
      className="num inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.1em]"
      style={{ color, border: `1.5px solid ${color}`, transform: `rotate(${tilt}deg)` }}
    >
      <Icon size={12} weight="bold" aria-hidden />
      {label}
    </span>
  );
}
