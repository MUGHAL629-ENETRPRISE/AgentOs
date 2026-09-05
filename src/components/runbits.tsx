import { ReactNode, useEffect, useRef, useState } from "react";
import {
  ArrowRight, Bot, Check, CheckCircle2, ChevronDown, Clock, Download,
  FileJson, FileText, ListChecks, Loader2, Play, Radar, RefreshCw, ShieldAlert,
  ShieldCheck, Sparkles, Wrench, X, XCircle,
} from "lucide-react";
import type { Approval, Claim, Finding, RecoveryEntry, Report, Run, RunEvent, ToolCall } from "../lib/types";
import { decideApproval, navigate } from "../lib/store";
import { cx, downloadFile, fmtClock, fmtDur, fmtElapsed, fmtNum, fmtTokens, timeAgo, useNow } from "../lib/util";
import { EmptyState, JSONViewer, ProgressBar, StatusBadge } from "./ui";

// ─────────────────────────── execution timeline ───────────────────────────

const EV_META: Record<string, { icon: ReactNode; cls: string }> = {
  "task.started": { icon: <Play size={12} />, cls: "text-run border-run/40" },
  "plan.created": { icon: <ListChecks size={12} />, cls: "text-brand border-brand/40" },
  "agent.started": { icon: <Bot size={12} />, cls: "text-run border-run/40" },
  "agent.thinking": { icon: <Sparkles size={12} />, cls: "text-dim border-edge" },
  "agent.completed": { icon: <Bot size={12} />, cls: "text-ok border-ok/40" },
  "step.completed": { icon: <Check size={12} />, cls: "text-ok border-ok/40" },
  "tool.started": { icon: <Wrench size={12} />, cls: "text-mid border-edge2" },
  "tool.completed": { icon: <CheckCircle2 size={12} />, cls: "text-ok border-ok/40" },
  "tool.failed": { icon: <XCircle size={12} />, cls: "text-bad border-bad/40" },
  "tool.retry": { icon: <RefreshCw size={12} />, cls: "text-warn border-warn/40" },
  "approval.required": { icon: <ShieldAlert size={12} />, cls: "text-warn border-warn/40" },
  "approval.granted": { icon: <CheckCircle2 size={12} />, cls: "text-ok border-ok/40" },
  "approval.rejected": { icon: <XCircle size={12} />, cls: "text-bad border-bad/40" },
  "verification.completed": { icon: <ShieldCheck size={12} />, cls: "text-ok border-ok/40" },
  "run.recovered": { icon: <RefreshCw size={12} />, cls: "text-brand border-brand/40" },
  "task.completed": { icon: <CheckCircle2 size={12} />, cls: "text-ok border-ok/40" },
  "task.failed": { icon: <XCircle size={12} />, cls: "text-bad border-bad/40" },
  "task.cancelled": { icon: <X size={12} />, cls: "text-dim border-edge" },
};

export function ExecutionTimeline({ events, maxHeight = 420, live }: { events: RunEvent[]; maxHeight?: number; live?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (live && ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [events.length, live]);
  if (events.length === 0) return <EmptyState icon={<Clock size={22} />} title="No events yet" hint="Events stream here the moment the orchestrator starts." />;
  return (
    <div ref={ref} className="relative overflow-y-auto pr-1" style={{ maxHeight }}>
      <div className="absolute bottom-2 left-[13px] top-2 w-px bg-edge" />
      <div className="space-y-1">
        {events.map((e) => {
          const meta = EV_META[e.type] ?? EV_META["tool.started"];
          const thinking = e.type === "agent.thinking";
          return (
            <div key={e.id} className="relative flex items-start gap-3 rounded-lg px-1 py-[5px] transition-colors hover:bg-ink-800/50">
              <span className={cx("relative z-10 mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border bg-ink-850", meta.cls)}>{meta.icon}</span>
              <div className="min-w-0 flex-1">
                <p className={cx("text-[12px] leading-snug", thinking ? "italic text-dim" : "text-mid", (e.type === "task.completed" || e.type === "task.failed") && "font-semibold text-hi")}>
                  {e.message}
                </p>
                {e.detail && !thinking && <p className="mt-0.5 truncate font-mono text-[10.5px] text-dim/80">{e.detail}</p>}
              </div>
              <span className="shrink-0 pt-0.5 font-mono text-[10px] text-dim">{fmtClock(e.ts)}</span>
            </div>
          );
        })}
        {live && (
          <div className="flex items-center gap-2 px-1 py-1.5">
            <Loader2 size={12} className="animate-spin text-run" />
            <span className="font-mono text-[10.5px] text-run">streaming…</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────── tool call inspector ───────────────────────────

const SERVER_LABEL: Record<string, string> = { "mcp-web": "Web Research", "mcp-github": "GitHub", "mcp-postgres": "PostgreSQL", "mcp-files": "Files" };

export function ToolCallRow({ tc, defaultOpen }: { tc: ToolCall; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  return (
    <div className={cx("overflow-hidden rounded-lg border transition-colors", tc.status === "FAILED" ? "border-bad/30" : tc.status === "REJECTED" ? "border-warn/30" : "border-edge")}>
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 bg-ink-850/60 px-3 py-2.5 text-left transition-colors hover:bg-ink-800/70">
        {tc.status === "RUNNING"
          ? <Loader2 size={13} className="shrink-0 animate-spin text-run" />
          : tc.status === "SUCCESS" ? <CheckCircle2 size={13} className="shrink-0 text-ok" />
          : tc.status === "REJECTED" ? <ShieldAlert size={13} className="shrink-0 text-warn" />
          : <XCircle size={13} className="shrink-0 text-bad" />}
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="font-mono text-[12px] font-semibold text-hi">{tc.tool}</span>
            <span className="rounded border border-edge bg-ink-700/60 px-1.5 py-px font-mono text-[9.5px] text-mid">{SERVER_LABEL[tc.server] ?? tc.server}</span>
            {tc.attempt > 1 && <span className="rounded border border-warn/30 bg-warn/10 px-1.5 py-px font-mono text-[9.5px] text-warn">attempt {tc.attempt}</span>}
          </span>
          <span className="mt-0.5 block font-mono text-[10px] text-dim">{tc.agent} agent · {fmtTokens(tc.tokens)} tok</span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block font-mono text-[11px] text-mid">{tc.status === "RUNNING" ? "…" : fmtDur(tc.durationMs)}</span>
          <span className="block font-mono text-[9.5px] text-dim">{fmtClock(tc.startedAt)}</span>
        </span>
        <ChevronDown size={13} className={cx("shrink-0 text-dim transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="grid gap-3 border-t border-edge bg-ink-900/60 p-3 md:grid-cols-2">
          <div>
            <p className="mb-1.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-dim">arguments</p>
            <div className="inset-panel max-h-52 overflow-y-auto py-1.5"><JSONViewer data={tc.args} /></div>
          </div>
          <div>
            <p className="mb-1.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-dim">{tc.error ? "error" : "result"}</p>
            {tc.error
              ? <div className="rounded-lg border border-bad/30 bg-bad/[0.07] p-3 font-mono text-[11.5px] text-bad">{tc.error}</div>
              : <div className="inset-panel max-h-52 overflow-y-auto py-1.5"><JSONViewer data={tc.result ?? { pending: true }} /></div>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── failure recovery chain ───────────────────────────

export function RecoveryChain({ r }: { r: RecoveryEntry }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-brand/25 bg-brand/[0.05] p-3">
      <span className="rounded-md border border-bad/30 bg-bad/10 px-2 py-1 font-mono text-[10.5px] text-bad">{r.tool} · FAILED</span>
      {r.failures.map((f, i) => (
        <span key={i} className="flex items-center gap-1.5">
          <ArrowRight size={11} className="text-dim" />
          <span className="rounded-md border border-warn/30 bg-warn/10 px-2 py-1 font-mono text-[10.5px] text-warn">retry {i + 1} · {f}</span>
        </span>
      ))}
      <ArrowRight size={11} className="text-dim" />
      <span className="rounded-md border border-ok/30 bg-ok/10 px-2 py-1 font-mono text-[10.5px] text-ok">{r.fallbackTool} · SUCCESS</span>
      <p className="mt-1 w-full font-mono text-[10.5px] text-mid">{r.resolution}</p>
    </div>
  );
}

// ─────────────────────────── run card ───────────────────────────

export function RunCard({ run }: { run: Run }) {
  const live = run.status === "RUNNING" || run.status === "AWAITING_APPROVAL" || run.status === "QUEUED";
  const now = useNow(live);
  const elapsed = (run.endedAt ?? now) - run.startedAt;
  const stepDone = run.plan.filter((p) => p.status === "COMPLETED").length;
  return (
    <button onClick={() => navigate("run", run.id)} className="card card-hover w-full p-4 text-left">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-hi">{run.task}</p>
        <StatusBadge status={run.status} />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <ProgressBar value={run.progress} tone={run.status === "FAILED" ? "bg-bad" : run.status === "AWAITING_APPROVAL" ? "bg-warn" : "bg-brand"} className="flex-1" />
        <span className="num shrink-0 text-[12px] font-semibold text-mid">{run.progress}%</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
        <Meta icon={<Bot size={11} />} label={run.activeAgent ? `${cap(run.activeAgent)} Agent` : stepDone ? `${stepDone}/${run.plan.length} steps` : "—"} />
        <Meta icon={<Clock size={11} />} label={fmtElapsed(elapsed)} />
        <Meta icon={<Wrench size={11} />} label={`${run.mcpCalls} MCP calls`} />
        <Meta icon={<Sparkles size={11} />} label={`${fmtTokens(run.tokens)} tokens`} />
      </div>
    </button>
  );
}

function Meta({ icon, label }: { icon: ReactNode; label: string }) {
  return <span className="flex items-center gap-1.5 font-mono text-[10.5px] capitalize text-dim">{icon}{label}</span>;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ─────────────────────────── claims & findings ───────────────────────────

export function ClaimRow({ c }: { c: Claim }) {
  return (
    <div className={cx("rounded-lg border p-3", c.verified ? "border-ok/25 bg-ok/[0.04]" : "border-warn/25 bg-warn/[0.04]")}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[12.5px] font-medium leading-snug text-hi">{c.claim}</p>
        <span className={cx("shrink-0 rounded-md border px-1.5 py-0.5 font-mono text-[9.5px] font-semibold", c.verified ? "border-ok/30 bg-ok/10 text-ok" : "border-warn/30 bg-warn/10 text-warn")}>
          {c.verified ? "VERIFIED" : "UNVERIFIED"}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10.5px] text-dim">
        <span>{c.sources} sources</span>
        <span>confidence <b className={c.confidence > 0.8 ? "text-ok" : "text-warn"}>{c.confidence.toFixed(2)}</b></span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1 w-16 overflow-hidden rounded-full bg-ink-700"><span className={cx("block h-full rounded-full", c.confidence > 0.8 ? "bg-ok" : "bg-warn")} style={{ width: `${c.confidence * 100}%` }} /></span>
        </span>
      </div>
      {c.contradictions && <p className="mt-2 rounded-md border border-warn/20 bg-warn/[0.05] px-2.5 py-1.5 text-[11px] leading-relaxed text-mid">⚠ {c.contradictions}</p>}
    </div>
  );
}

export function FindingRow({ f }: { f: Finding }) {
  return (
    <div className="rounded-lg border border-edge bg-ink-850/50 p-3 transition-colors hover:border-edge2">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[12.5px] font-semibold leading-snug text-hi">{f.title}</p>
        <span className="shrink-0 font-mono text-[10px] text-ok">{f.confidence.toFixed(2)}</span>
      </div>
      <p className="mt-1 text-[11.5px] leading-relaxed text-mid">{f.detail}</p>
      <p className="mt-1.5 flex items-center gap-1.5 font-mono text-[10px] text-dim"><Radar size={10} /> {f.source} · {f.agent} agent</p>
    </div>
  );
}

// ─────────────────────────── report viewer ───────────────────────────

export function ReportView({ report }: { report: Report }) {
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="rounded-md border border-brand/30 bg-brand/10 px-2 py-0.5 font-mono text-[10px] text-brand">{report.format}</span>
        <span className="font-mono text-[10.5px] text-dim">{report.pages} pages · {fmtNum(report.tokens)} tokens · {timeAgo(report.createdAt)}</span>
        <div className="ml-auto flex gap-1.5">
          <button onClick={() => downloadFile(`${report.title.slice(0, 40)}.md`, report.markdown)}
            className="flex items-center gap-1 rounded-md border border-edge bg-ink-700/60 px-2 py-1 font-mono text-[10px] text-mid transition-colors hover:border-brand/40 hover:text-brand">
            <Download size={11} /> .md
          </button>
          <button onClick={() => downloadFile(`${report.title.slice(0, 40)}.json`, JSON.stringify(report.sections, null, 2), "application/json")}
            className="flex items-center gap-1 rounded-md border border-edge bg-ink-700/60 px-2 py-1 font-mono text-[10px] text-mid transition-colors hover:border-brand/40 hover:text-brand">
            <FileJson size={11} /> .json
          </button>
        </div>
      </div>
      <div className="space-y-4">
        {report.sections.map((s) => (
          <div key={s.heading}>
            <h4 className="mb-1.5 flex items-center gap-2 font-display text-[13px] font-semibold text-brand">
              <FileText size={12} /> {s.heading}
            </h4>
            <div className="space-y-1">
              {s.body.map((line, i) => (
                <p key={i} className={cx("text-[12px] leading-relaxed", line.startsWith("- ") ? "pl-3 text-mid before:mr-2 before:text-brand before:content-['—']" : "text-mid")}>
                  {line.replace(/^- /, "").split("**").map((part, j) => j % 2 ? <b key={j} className="font-semibold text-hi">{part}</b> : part)}
                </p>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────── approval card ───────────────────────────

export function ApprovalCard({ a, showRun }: { a: Approval; showRun?: boolean }) {
  const pending = a.status === "PENDING";
  return (
    <div className={cx("card p-4", pending && "border-warn/40")}>
      <div className="flex flex-wrap items-center gap-2">
        {pending ? <ShieldAlert size={15} className="text-warn" /> : a.status === "APPROVED" ? <CheckCircle2 size={15} className="text-ok" /> : <XCircle size={15} className="text-bad" />}
        <p className="flex-1 text-[13px] font-semibold text-hi">{a.action}</p>
        <StatusBadge status={a.status} />
      </div>
      <p className="mt-2 text-[11.5px] leading-relaxed text-mid">{a.description}</p>
      <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {Object.entries(a.summary).slice(0, 3).map(([k, v]) => (
          <div key={k} className="inset-panel px-2.5 py-1.5">
            <p className="font-mono text-[9px] uppercase tracking-wider text-dim">{k}</p>
            <p className="truncate font-mono text-[11px] text-hi">{v}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3 font-mono text-[10px] text-dim">
        <span>{cap(a.agent)} Agent</span><span>·</span><span>{a.server}</span><span>·</span><span>{timeAgo(a.createdAt)}</span>
        {showRun && <button onClick={() => navigate("run", a.runId)} className="ml-auto text-brand hover:underline">view run →</button>}
      </div>
      {pending && (
        <div className="mt-3 flex gap-2">
          <button onClick={() => decideApproval(a.id, false)} className="flex-1 rounded-lg border border-edge bg-ink-700/50 py-2 text-[12px] font-semibold text-mid transition-colors hover:border-bad/50 hover:text-bad">Reject</button>
          <button onClick={() => decideApproval(a.id, true)} className="flex-1 rounded-lg bg-ok/90 py-2 text-[12px] font-bold text-ink-950 transition-all hover:bg-ok active:scale-[0.98]">Approve & resume</button>
        </div>
      )}
    </div>
  );
}

export function LiveDot() {
  return <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-run opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-run" /></span>;
}
