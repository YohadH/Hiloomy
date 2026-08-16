import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function GrowthStatusBadge({ status }: { status: string }) {
  const classes: Record<string, string> = {
    active: "border-emerald-200 bg-emerald-50 text-emerald-700",
    paused: "border-slate-200 bg-slate-100 text-slate-700",
    normal: "border-emerald-200 bg-emerald-50 text-emerald-700",
    warning: "border-amber-200 bg-amber-50 text-amber-700",
    critical: "border-rose-200 bg-rose-50 text-rose-700",
    connected: "border-emerald-200 bg-emerald-50 text-emerald-700",
    not_connected: "border-slate-200 bg-slate-100 text-slate-700",
    degraded: "border-amber-200 bg-amber-50 text-amber-700",
    stub: "border-sky-200 bg-sky-50 text-sky-700",
    needs_oauth: "border-violet-200 bg-violet-50 text-violet-700",
    recommended: "border-sky-200 bg-sky-50 text-sky-700",
    pending_approval: "border-amber-200 bg-amber-50 text-amber-700",
    approved: "border-indigo-200 bg-indigo-50 text-indigo-700",
    executed: "border-emerald-200 bg-emerald-50 text-emerald-700",
    rejected: "border-slate-200 bg-slate-100 text-slate-700",
    blocked: "border-rose-200 bg-rose-50 text-rose-700",
    failed: "border-rose-200 bg-rose-50 text-rose-700",
    info: "border-sky-200 bg-sky-50 text-sky-700",
    low: "border-emerald-200 bg-emerald-50 text-emerald-700",
    medium: "border-amber-200 bg-amber-50 text-amber-700",
    high: "border-rose-200 bg-rose-50 text-rose-700"
  };

  return (
    <Badge className={cn("normal-case tracking-normal", classes[status] ?? "")}>
      {status.replaceAll("_", " ")}
    </Badge>
  );
}
