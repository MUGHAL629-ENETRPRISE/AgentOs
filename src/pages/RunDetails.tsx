import { useState } from "react";
import { ArrowLeft, Bot, FileText, Radar, ShieldAlert, Square, Wrench } from "lucide-react";
import type { GraphNodeId } from "../lib/types";
import { cancelRun, navigate, useApp } from "../lib/store";
import { cx, fmtClock, fmtDur, fmtElapsed, fmtMoney, fmtTokens, useNow } from "../lib/util";
import { EmptyState, StatusBadge } from "../components/ui";
import { StateLegend, WorkflowCanvas } from "../components/WorkflowCanvas";
import { ApprovalCard, ClaimRow, ExecutionTimeline, FindingRow, RecoveryChain, ReportView, ToolCallRow } from "../components/runbits";

type Tab = "timeline" | "tools" | "findings" | "report";

export function RunDetails() {
  const s = useApp();
  const run = s.runs.find((r) => r.id === s.route.runId);
  const [tab, setTab] = useState<Tab>("timeline");
  const [selected, setSelected] = useState<GraphNodeId | null>(null);
  const now = useNow(Boolean(run && ["RUNNING", "AWAITING_APPROVAL"].includes(run.status)));

  if (!run) {
    return <EmptyState icon={<Radar size={22} />} title="Run not found" hint="It may have been cleared when demo data was reset.">
      <button onClick={() => navigate("runs")} className="mt-1 rounded-lg border border-brand/40 bg-brand/10 px-3 py-1.5 text-[11.5px] font-semibold text-brand">Back to runs</button>
    </EmptyState>;
  }

  const live = ["RUNNING", "AWAITING_APPROVAL", "QUEUED"].includes(run.status);
  const elapsed = (run.endedAt ?? now) - run.startedAt;
  const report = s.reports.find((r) => r.id === run.reportId);
  const agentDef = selected ? s.agents.find((a) => a.id === selected) : undefined;
  const stepFor = selected ? run.plan.find((p) => p.agent === selected) : undefined;
  const toolsFor = selected ? run.toolCalls.filter((t) => t.agent === selected) : [];

  return (
    <div className="animate-fade-up space-y-4">
      {/* header */}
      <section className="card p-4">
        <div className="flex flex-wrap items-start gap-3">
          <button onClick={() => navigate("runs")} className="mt-0.5 rounded-md border border-edge bg-ink-800 p-1.5 text-mid transition-colors hover:text-hi" aria-label="Back to runs"><ArrowLeft size={14} /></button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={run.status} />
              <span className="font-mono text-[10px] text-dim">{run.id} · started {fmtClock(run.startedAt)}</span>
            </div>
            <h2 className="mt-1.5 text-[15px] font-semibold leading-snug text-hi">{run.task}</h2>
          </div>
          <div className="flex items-center gap-2">
            {live && (
              <button onClick={() => cancelRun(run.id)} className="flex items-center gap-1.5 rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-[12px] font-semibold text-bad transition-colors hover:bg-bad/20">
                <Square size={12} /> Cancel
              </button>
            )}
            {report && (
              <button onClick={() => { setTab("report"); document.querySelector("main")?.scrollTo({ top: 0, behavior: "smooth" }); }} className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-[12px] font-bold text-ink-950 transition-all hover:brightness-110">
                <FileText size={12} /> View report
              </button>
            )}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <HeaderStat label="Elapsed" value={fmtElapsed(elapsed)} live={live} />
          <HeaderStat label="Progress" value={`${run.progress}%`} />
          <HeaderStat label="Steps" value={`${run.plan.filter((p) => p.status === "COMPLETED").length}/${run.plan.length}`} />
          <HeaderStat label="MCP calls" value={String(run.mcpCalls)} />
          <HeaderStat label="Tokens" value={fmtTokens(run.tokens)} />
          <HeaderStat label="Est. cost" value={fmtMoney(run.cost)} />
        </div>
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-ink-700">
          <div className={cx("h-full rounded-full transition-all duration-700", run.status === "FAILED" ? "bg-bad" : run.status === "AWAITING_APPROVAL" ? "bg-warn" : "bg-brand")} style={{ width: `${run.progress}%` }} />
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-3">
        {/* left: graph + tabs */}
        <div className="space-y-4 xl:col-span-2">
          <section className="card overflow-hidden">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-edge px-4 py-3">
              <h3 className="font-display text-[13.5px] font-semibold text-hi">Execution graph <span className="ml-1 font-mono text-[10px] font-normal text-dim">langgraph · conditional edges</span></h3>
              <StateLegend />
            </header>
            <div className="h-[440px]">
              <WorkflowCanvas run={run} selected={selected} onSelect={(id) => setSelected(id === selected ? null : id)} />
            </div>
          </section>

          {selected && (
            <section className="card animate-fade-up p-4">
              <header className="mb-3 flex items-center justify-between">
                <h3 className="flex items-center gap-2 font-display text-[13.5px] font-semibold capitalize text-hi">
                  <Bot size={14} className="text-brand" /> {selected.replace(/_/g, " ")} node
                  {run.nodeStates[selected] && <StatusBadge status={run.nodeStates[selected]!} />}
                </h3>
                <button onClick={() => setSelected(null)} className="font-mono text-[10.5px] text-dim hover:text-hi">close</button>
              </header>
              {agentDef ? (
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <p className="text-[12px] leading-relaxed text-mid">{agentDef.description}</p>
                    {stepFor && (
                      <div className="inset-panel mt-3 p-3">
                        <p className="font-mono text-[9.5px] uppercase tracking-wider text-dim">assigned step</p>
                        <p className="mt-1 text-[12.5px] font-semibold text-hi">{stepFor.title}</p>
                        <p className="mt-0.5 text-[11.5px] text-mid">{stepFor.description}</p>
                        {stepFor.durationMs !== undefined && <p className="mt-1.5 font-mono text-[10px] text-dim">duration {fmtDur(stepFor.durationMs)}</p>}
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="mb-1.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-dim">tool calls ({toolsFor.length})</p>
                    <div className="space-y-2">
                      {toolsFor.length === 0 && <p className="text-[11.5px] text-dim">No tool calls for this node yet.</p>}
                      {toolsFor.map((tc) => <ToolCallRow key={tc.id} tc={tc} />)}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-[12px] text-mid">
                  {selected === "router" && "Conditional edge layer — routes each planned subtask to the matching specialized agent based on required capabilities."}
                  {selected === "approval" && "Human-in-the-loop gate. Sensitive MCP writes (create_issue, insert/update_record) pause the graph at a checkpoint and resume in place once decided."}
                </p>
              )}
            </section>
          )}

          <section className="card">
            <div className="flex items-center gap-1 border-b border-edge px-3 py-2">
              {([["timeline", "Timeline"], ["tools", `Tool calls · ${run.toolCalls.length}`], ["findings", `Findings · ${run.findings.length}`], ["report", "Report"]] as [Tab, string][]).map(([t, label]) => (
                <button key={t} onClick={() => setTab(t)}
                  className={cx("rounded-md px-3 py-1.5 text-[12px] font-semibold transition-colors", tab === t ? "bg-ink-700 text-hi" : "text-dim hover:text-mid")}>
                  {label}
                </button>
              ))}
            </div>
            <div className="p-4">
              {tab === "timeline" && <ExecutionTimeline events={run.events} maxHeight={520} live={live} />}
              {tab === "tools" && (
                <div className="space-y-3">
                  {run.recoveries.length > 0 && (
                    <div className="space-y-2">
                      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-dim">Failure recovery</p>
                      {run.recoveries.map((r) => <RecoveryChain key={r.id} r={r} />)}
                    </div>
                  )}
                  {run.toolCalls.length === 0 && <EmptyState icon={<Wrench size={20} />} title="No tool calls yet" hint="MCP executions appear here as agents work." />}
                  {run.toolCalls.map((tc) => <ToolCallRow key={tc.id} tc={tc} />)}
                </div>
              )}
              {tab === "findings" && (
                <div className="space-y-4">
                  {run.findings.length === 0 && run.claims.length === 0 && <EmptyState icon={<Radar size={20} />} title="No findings yet" hint="Research and coding agents deposit verified findings here." />}
                  {run.findings.length > 0 && (
                    <div>
                      <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-dim">Findings</p>
                      <div className="grid gap-2 md:grid-cols-2">{run.findings.map((f) => <FindingRow key={f.id} f={f} />)}</div>
                    </div>
                  )}
                  {run.claims.length > 0 && (
                    <div>
                      <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-dim">Verification</p>
                      <div className="space-y-2">{run.claims.map((c) => <ClaimRow key={c.id} c={c} />)}</div>
                    </div>
                  )}
                </div>
              )}
              {tab === "report" && (report
                ? <ReportView report={report} />
                : <EmptyState icon={<FileText size={20} />} title="Report not generated yet" hint={live ? "The Report Agent produces the final artifact at the end of the run." : "This run ended before the report step."} />)}
            </div>
          </section>
        </div>

        {/* right rail */}
        <div className="space-y-4">
          <section className="card p-4">
            <h3 className="mb-3 font-display text-[13.5px] font-semibold text-hi">Plan</h3>
            <ol className="space-y-1.5">
              {run.plan.map((step, i) => (
                <li key={step.id} className="flex items-center gap-2.5 rounded-lg border border-edge/70 bg-ink-850/40 px-2.5 py-2">
                  <span className={cx("num flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10.5px] font-bold",
                    step.status === "COMPLETED" ? "bg-ok/15 text-ok" : step.status === "RUNNING" ? "bg-run/15 text-run" : step.status === "FAILED" ? "bg-bad/15 text-bad" : "bg-ink-700 text-dim")}>{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11.5px] font-medium text-hi">{step.title}</span>
                    <span className="block font-mono text-[9.5px] capitalize text-dim">{step.agent} · {step.status.toLowerCase()}{step.durationMs ? ` · ${fmtDur(step.durationMs)}` : ""}</span>
                  </span>
                  {step.status === "RUNNING" && <span className="h-3 w-3 shrink-0 animate-spin rounded-full border border-run border-t-transparent" />}
                </li>
              ))}
              {run.plan.length === 0 && <p className="text-[11.5px] text-dim">Planning…</p>}
            </ol>
          </section>

          <section className="card p-4">
            <h3 className="mb-3 flex items-center gap-2 font-display text-[13.5px] font-semibold text-hi"><ShieldAlert size={14} className="text-warn" /> Approvals</h3>
            {run.approvals.length === 0
              ? <p className="text-[11.5px] leading-relaxed text-dim">{run.options.requireApproval ? "No sensitive operations hit the gate yet." : "Approval gates disabled for this run."}</p>
              : <div className="space-y-2.5">{run.approvals.map((a) => <ApprovalCard key={a.id} a={a} />)}</div>}
          </section>

          {run.summary && (
            <section className="card border-ok/30 p-4">
              <h3 className="mb-2 font-display text-[13.5px] font-semibold text-ok">Final result</h3>
              <p className="text-[12px] leading-relaxed text-mid">{run.summary}</p>
              {report && <button onClick={() => setTab("report")} className="mt-2 text-[11.5px] font-semibold text-brand hover:underline">Open full report →</button>}
            </section>
          )}
          {run.status === "FAILED" && (
            <section className="card border-bad/30 p-4">
              <h3 className="mb-2 font-display text-[13.5px] font-semibold text-bad">Terminated</h3>
              <p className="text-[12px] leading-relaxed text-mid">{run.summary ?? "The run ended with an unrecovered failure. Inspect the tool call timeline for the error chain."}</p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function HeaderStat({ label, value, live }: { label: string; value: string; live?: boolean }) {
  return (
    <div className="inset-panel px-3 py-2">
      <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-dim">{label}</p>
      <p className={cx("num mt-0.5 text-[15px] font-semibold", live ? "text-run" : "text-hi")}>{value}</p>
    </div>
  );
}
