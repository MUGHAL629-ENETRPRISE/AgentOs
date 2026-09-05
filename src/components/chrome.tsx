import { ReactNode, useState } from "react";
import {
  AlertTriangle, BarChart3, Bell, Bot, Check, CheckCircle2, ChevronRight, Clock,
  FileText, FlaskConical, GitBranch, LayoutDashboard, ListChecks, Menu,
  PlusSquare, Server, Settings, ShieldAlert, Wrench,
} from "lucide-react";
import type { Page } from "../lib/types";
import { BOOT_STEPS, decideApproval, dismissToast, markNotifsRead, navigate, useApp } from "../lib/store";
import { cx, timeAgo } from "../lib/util";
import { Modal, StatusBadge, ToastCard } from "./ui";

// ─────────────────────────── logo ───────────────────────────

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="8" fill="#111A26" stroke="#1E2D3E" />
      <path d="M16 6l8.5 4.8v9.6L16 25l-8.5-4.6v-9.6z" stroke="#2DD4BF" strokeWidth="1.6" />
      <circle cx="16" cy="15.4" r="2.9" fill="#2DD4BF" />
      <circle cx="10.4" cy="18.8" r="1.5" fill="#38BDF8" />
      <circle cx="21.6" cy="18.8" r="1.5" fill="#38BDF8" />
      <path d="M12 17.6l2.4-1.4M20 17.6l-2.4-1.4" stroke="#38BDF8" strokeWidth="0.9" />
    </svg>
  );
}

// ─────────────────────────── sidebar ───────────────────────────

const NAV: Array<{ group: string; items: Array<{ page: Page; label: string; icon: ReactNode }> }> = [
  {
    group: "Overview",
    items: [
      { page: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={15} /> },
      { page: "new", label: "New Task", icon: <PlusSquare size={15} /> },
      { page: "runs", label: "Active Runs", icon: <ListChecks size={15} /> },
    ],
  },
  {
    group: "Orchestration",
    items: [
      { page: "workflows", label: "Workflows", icon: <GitBranch size={15} /> },
      { page: "agents", label: "Agents", icon: <Bot size={15} /> },
      { page: "mcp", label: "MCP Servers", icon: <Server size={15} /> },
      { page: "tools", label: "Tool Calls", icon: <Wrench size={15} /> },
    ],
  },
  {
    group: "Knowledge",
    items: [
      { page: "memory", label: "Memory", icon: <FlaskConical size={15} /> },
      { page: "approvals", label: "Approvals", icon: <ShieldAlert size={15} /> },
      { page: "reports", label: "Reports", icon: <FileText size={15} /> },
    ],
  },
  {
    group: "Insights",
    items: [
      { page: "analytics", label: "Analytics", icon: <BarChart3 size={15} /> },
      { page: "settings", label: "Settings", icon: <Settings size={15} /> },
    ],
  },
];

export function Sidebar({ mobileOpen, onClose }: { mobileOpen: boolean; onClose: () => void }) {
  const s = useApp();
  const activeRuns = s.runs.filter((r) => r.status === "RUNNING" || r.status === "AWAITING_APPROVAL" || r.status === "QUEUED").length;
  const pending = s.approvals.filter((a) => a.status === "PENDING").length;
  const badges: Partial<Record<Page, ReactNode>> = {
    runs: activeRuns > 0 && (
      <span className="flex items-center gap-1 rounded-md bg-run/15 px-1.5 py-0.5 font-mono text-[10px] text-run">
        <span className="h-1 w-1 animate-pulse-soft rounded-full bg-run" />{activeRuns}
      </span>
    ),
    approvals: pending > 0 && <span className="rounded-md bg-warn/15 px-1.5 py-0.5 font-mono text-[10px] text-warn">{pending}</span>,
  };

  const body = (
    <div className="flex h-full flex-col">
      <button onClick={() => navigate("dashboard")} className="flex items-center gap-2.5 px-4 pb-5 pt-5 text-left">
        <Logo />
        <span>
          <span className="block font-display text-[15px] font-bold leading-tight tracking-tight text-hi">AgentOS</span>
          <span className="block font-mono text-[9.5px] uppercase tracking-[0.18em] text-dim">command center</span>
        </span>
      </button>
      <nav className="flex-1 space-y-4 overflow-y-auto px-2.5 pb-4">
        {NAV.map((g) => (
          <div key={g.group}>
            <p className="px-2 pb-1.5 font-mono text-[9.5px] uppercase tracking-[0.16em] text-dim/80">{g.group}</p>
            <div className="space-y-0.5">
              {g.items.map((it) => {
                const active = s.route.page === it.page || (it.page === "runs" && s.route.page === "run");
                return (
                  <button key={it.page} onClick={() => { navigate(it.page); onClose(); }}
                    className={cx("group relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12.5px] font-medium transition-all duration-150",
                      active ? "bg-ink-700/70 text-hi" : "text-mid hover:bg-ink-800 hover:text-hi")}>
                    <span className={cx("absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-brand transition-opacity", active ? "opacity-100" : "opacity-0")} />
                    <span className={cx("transition-colors", active ? "text-brand" : "text-dim group-hover:text-mid")}>{it.icon}</span>
                    <span className="flex-1 text-left">{it.label}</span>
                    {badges[it.page]}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="mx-2.5 mb-3 rounded-lg border border-warn/25 bg-warn/[0.06] p-3">
        <p className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-warn">
          <FlaskConical size={11} /> Demo Mode
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-mid">Agents, MCP calls & telemetry are simulated in-browser. Swap in the FastAPI backend for live execution.</p>
      </div>
      <div className="border-t border-edge px-4 py-2.5">
        <p className="font-mono text-[10px] text-dim">v0.9.2 · langgraph 0.4 · mcp 1.2</p>
      </div>
    </div>
  );

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[218px] border-r border-edge bg-ink-900/80 backdrop-blur lg:block">{body}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink-950/70 animate-fade-in" onClick={onClose} />
          <aside className="absolute inset-y-0 left-0 w-[240px] border-r border-edge bg-ink-900 animate-slide-in">{body}</aside>
        </div>
      )}
    </>
  );
}

// ─────────────────────────── topbar ───────────────────────────

const TITLES: Record<Page, string> = {
  dashboard: "Command Center", new: "New Task", runs: "Active Runs", run: "Run Details",
  workflows: "Workflows", agents: "Agent Registry", mcp: "MCP Servers", tools: "Tool Call Inspector",
  memory: "Semantic Memory", approvals: "Human-in-the-Loop", reports: "Report Library",
  analytics: "Analytics", settings: "Settings",
};

export function TopBar({ onMenu }: { onMenu: () => void }) {
  const s = useApp();
  const pending = s.approvals.filter((a) => a.status === "PENDING").length;
  return (
    <header className="sticky top-0 z-30 flex h-[54px] items-center gap-3 border-b border-edge bg-ink-900/75 px-4 backdrop-blur-md">
      <button onClick={onMenu} className="rounded-md p-1.5 text-mid hover:bg-ink-700 hover:text-hi lg:hidden" aria-label="Open navigation"><Menu size={17} /></button>
      <div className="min-w-0">
        <h1 className="truncate font-display text-[15px] font-semibold tracking-tight text-hi">{TITLES[s.route.page]}</h1>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <span className="hidden items-center gap-1.5 rounded-md border border-ok/25 bg-ok/[0.07] px-2 py-1 font-mono text-[10.5px] text-ok md:inline-flex">
          <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-ok" /> OPERATIONAL
        </span>
        <span className="hidden items-center gap-1.5 rounded-md border border-edge bg-ink-800 px-2 py-1 font-mono text-[10.5px] text-mid md:inline-flex">
          <Server size={11} className="text-brand" /> {s.servers.filter((x) => x.status === "CONNECTED").length}/{s.servers.length} MCP
        </span>
        <span className="hidden items-center gap-1.5 rounded-md border border-edge bg-ink-800 px-2 py-1 font-mono text-[10.5px] text-mid xl:inline-flex">
          {s.settings.provider} · {s.settings.model}
        </span>
        <NotifBell pending={pending} />
        <UserMenu />
      </div>
    </header>
  );
}

function NotifBell({ pending }: { pending: number }) {
  const s = useApp();
  const [open, setOpen] = useState(false);
  const unread = s.notifs.filter((n) => !n.read).length;
  const iconFor = (k: string) => k === "success" ? <CheckCircle2 size={13} className="text-ok" /> : k === "warn" ? <AlertTriangle size={13} className="text-warn" /> : <Bell size={13} className="text-run" />;
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="relative rounded-md border border-edge bg-ink-800 p-1.5 text-mid transition-colors hover:text-hi" aria-label="Notifications">
        <Bell size={15} />
        {unread > 0 && <span className="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-warn px-0.5 font-mono text-[9px] font-bold text-ink-950">{unread}</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-[330px] animate-fade-up rounded-xl border border-edge bg-ink-850 shadow-2xl shadow-black/60">
            <div className="flex items-center justify-between border-b border-edge px-3.5 py-2.5">
              <p className="font-mono text-[10.5px] uppercase tracking-wider text-dim">Notifications {pending > 0 && <span className="text-warn">· {pending} approval{pending > 1 ? "s" : ""} pending</span>}</p>
              <button onClick={() => markNotifsRead()} className="text-[11px] text-brand hover:underline">Mark all read</button>
            </div>
            <div className="max-h-[320px] overflow-y-auto p-1.5">
              {s.notifs.length === 0 && <p className="px-3 py-8 text-center text-xs text-dim">No notifications yet.</p>}
              {s.notifs.slice(0, 10).map((n) => (
                <button key={n.id} onClick={() => { markNotifsRead(); if (n.runId) navigate("run", n.runId); setOpen(false); }}
                  className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-ink-700/60">
                  <span className="mt-0.5 shrink-0">{iconFor(n.kind)}</span>
                  <span className="min-w-0 flex-1">
                    <span className={cx("block truncate text-[12px] font-medium", n.read ? "text-mid" : "text-hi")}>{n.title}</span>
                    {n.detail && <span className="block truncate text-[11px] text-dim">{n.detail}</span>}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-dim">{timeAgo(n.ts)}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function UserMenu() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 rounded-md border border-edge bg-ink-800 py-1 pl-1 pr-2 transition-colors hover:border-edge2">
        <span className="flex h-6 w-6 items-center justify-center rounded bg-brand/15 font-display text-[11px] font-bold text-brand">AV</span>
        <span className="hidden text-left sm:block">
          <span className="block text-[11.5px] font-semibold leading-tight text-hi">Ada V.</span>
          <span className="block font-mono text-[9px] leading-tight text-dim">admin</span>
        </span>
        <ChevronRight size={12} className={cx("text-dim transition-transform", open && "rotate-90")} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-44 animate-fade-up rounded-lg border border-edge bg-ink-850 p-1.5 shadow-2xl shadow-black/60">
            {[["Profile", "Profile is a stub in demo mode"], ["Preferences", "Opens Settings"], ["Sign out", "Signed out (demo)"]].map(([label]) => (
              <button key={label} onClick={() => { setOpen(false); if (label === "Preferences") navigate("settings"); }}
                className="block w-full rounded-md px-2.5 py-1.5 text-left text-[12px] text-mid transition-colors hover:bg-ink-700 hover:text-hi">{label}</button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────── boot overlay ───────────────────────────

export function BootOverlay() {
  const s = useApp();
  if (s.booted) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink-950">
      <div className="w-[340px] animate-fade-up">
        <div className="flex items-center gap-3">
          <Logo size={38} />
          <div>
            <p className="font-display text-lg font-bold tracking-tight text-hi">AgentOS</p>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-dim">initializing orchestrator</p>
          </div>
        </div>
        <div className="mt-6 space-y-2.5">
          {BOOT_STEPS.map((step, i) => {
            const done = s.bootStep > i;
            const current = s.bootStep === i;
            return (
              <div key={step} className={cx("flex items-center gap-2.5 font-mono text-[11.5px] transition-opacity duration-300", done ? "text-mid" : current ? "text-hi" : "text-dim/50")}>
                {done ? <Check size={13} className="text-ok" /> : current ? <span className="h-3 w-3 animate-spin rounded-full border border-run border-t-transparent" /> : <span className="h-3 w-3 rounded-full border border-edge" />}
                {step}
              </div>
            );
          })}
        </div>
        <div className="mt-6 h-1 overflow-hidden rounded-full bg-ink-700">
          <div className="h-full rounded-full bg-brand transition-all duration-500" style={{ width: `${(s.bootStep / BOOT_STEPS.length) * 100}%` }} />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── global approval modal ───────────────────────────

export function ApprovalGate() {
  const s = useApp();
  const ap = s.approvals.find((a) => a.id === s.openApprovalId);
  if (!ap || ap.status !== "PENDING") return null;
  return (
    <Modal open onClose={() => decideApproval(ap.id, false)} tone="warn" title={
      <span className="flex items-center gap-2 text-warn"><ShieldAlert size={15} /> ACTION REQUIRES APPROVAL</span>
    }>
      <div className="space-y-3">
        <div className="rounded-lg border border-warn/30 bg-warn/[0.06] p-3">
          <p className="text-[12px] leading-relaxed text-mid">{ap.description}</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <MetaRow k="Agent" v={ap.agent} />
          <MetaRow k="Action" v={ap.action} />
          <MetaRow k="MCP server" v={ap.server} />
          <MetaRow k="Risk" v={ap.risk} />
        </div>
        <div className="inset-panel p-3">
          {Object.entries(ap.summary).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 py-1 text-[12px]">
              <span className="font-mono text-[10.5px] uppercase tracking-wider text-dim">{k}</span>
              <span className="truncate text-right font-medium text-hi">{v}</span>
            </div>
          ))}
        </div>
        <p className="flex items-center gap-1.5 font-mono text-[10.5px] text-dim">
          <Clock size={11} /> Graph is paused at a checkpoint and will resume exactly where it stopped.
        </p>
        <div className="flex gap-2 pt-1">
          <button onClick={() => decideApproval(ap.id, false)}
            className="flex-1 rounded-lg border border-edge bg-ink-700/50 px-4 py-2.5 text-[12.5px] font-semibold text-mid transition-colors hover:border-bad/50 hover:text-bad">
            Reject
          </button>
          <button onClick={() => decideApproval(ap.id, true)}
            className="flex-1 rounded-lg bg-ok/90 px-4 py-2.5 text-[12.5px] font-bold text-ink-950 transition-all hover:bg-ok active:scale-[0.98]">
            Approve & resume
          </button>
        </div>
      </div>
    </Modal>
  );
}

function MetaRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="inset-panel px-3 py-2">
      <p className="font-mono text-[9.5px] uppercase tracking-wider text-dim">{k}</p>
      <p className="mt-0.5 truncate font-mono text-[11.5px] font-medium capitalize text-hi">{v.replace(/_/g, " ")}</p>
    </div>
  );
}

// ─────────────────────────── toast host ───────────────────────────

export function ToastHost() {
  const s = useApp();
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
      {s.toasts.map((t) => <ToastCard key={t.id} kind={t.kind} title={t.title} detail={t.detail} onClose={() => dismissToast(t.id)} />)}
    </div>
  );
}

export function PageHead({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="font-display text-xl font-bold tracking-tight text-hi">{title}</h2>
        {sub && <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-dim">{sub}</p>}
      </div>
      {children}
    </div>
  );
}

export function StatusStrip({ status }: { status: string }) {
  return <StatusBadge status={status} />;
}
