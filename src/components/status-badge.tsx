import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { RuleStatus } from "@/lib/contracts";

const statusStyles: Record<RuleStatus, string> = {
  gap: "border-red-400/30 bg-red-400/10 text-red-300",
  needs_review: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  not_evaluated: "border-zinc-400/25 bg-zinc-400/10 text-zinc-300",
  satisfied: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  not_applicable: "border-slate-500/20 bg-slate-500/5 text-slate-400",
};

const labels: Record<RuleStatus, string> = {
  gap: "Gap",
  needs_review: "Needs review",
  not_evaluated: "Not evaluated",
  satisfied: "Satisfied",
  not_applicable: "Not applicable",
};

export function StatusBadge({ status }: { status: RuleStatus }) {
  return (
    <Badge variant="outline" className={cn("font-medium", statusStyles[status])}>
      {labels[status]}
    </Badge>
  );
}
