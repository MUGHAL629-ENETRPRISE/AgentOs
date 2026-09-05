import { useState } from "react";
import { ListChecks } from "lucide-react";
import { navigate, useApp } from "../lib/store";
import { EmptyState, Seg } from "../components/ui";
import { PageHead } from "../components/chrome";
import { RunCard } from "../components/runbits";

type Filter = "all" | "live" | "done" | "failed";

export function RunsPage() {
  const s = useApp();
  const [filter, setFilter] = useState<Filter>("all");
  const runs = s.runs.filter((r) =>
    filter === "all" ? true :
    filter === "live" ? ["RUNNING", "AWAITING_APPROVAL", "QUEUED"].includes(r.status) :
    filter === "done" ? r.status === "COMPLETED" :
    r.status === "FAILED" || r.status === "CANCELLED");

  return (
    <div className="animate-fade-up">
      <PageHead title="Active Runs" sub="Every orchestrated execution — live, paused at approval gates, and historical. Open a run to inspect its graph, timeline and tool calls.">
        <Seg<Filter>
          options={[{ v: "all", label: "All" }, { v: "live", label: "Live" }, { v: "done", label: "Completed" }, { v: "failed", label: "Failed" }]}
          value={filter} onChange={setFilter}
        />
      </PageHead>
      {runs.length === 0
        ? <EmptyState icon={<ListChecks size={22} />} title="No runs in this view" hint="Change the filter or start a new task to see orchestrated executions here.">
          <button onClick={() => navigate("new")} className="mt-1 rounded-lg border border-brand/40 bg-brand/10 px-3 py-1.5 text-[11.5px] font-semibold text-brand hover:bg-brand/20">New Task</button>
        </EmptyState>
        : <div className="grid gap-3 xl:grid-cols-2">{runs.map((r) => <RunCard key={r.id} run={r} />)}</div>}
    </div>
  );
}
