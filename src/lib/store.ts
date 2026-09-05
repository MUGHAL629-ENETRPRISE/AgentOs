import { useSyncExternalStore } from "react";
import type {
  AppState, Approval, MemoryItem, Notif, Page, PlanStep, Report, RouteState, Run,
  Settings, TaskOptions, Toast, Totals,
} from "./types";
import { THINKING, buildSeedState, defaultOptions } from "./data";
import { EngineIO, buildPlan, executeRun } from "./engine";
import { sleep, uid } from "./util";

// ─────────────────────────── state container ───────────────────────────

const SETTINGS_KEY = "agentos.settings.v1";

function loadSettings(): Settings {
  const base: Settings = {
    provider: "Groq", model: "llama-3.3-70b", temperature: 0.2, maxTokens: 8192,
    apiKey: "", webResearch: true, useMemory: true, requireApproval: true, telemetry: true,
  };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...base, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch { /* ignore */ }
  return base;
}

function parseHash(): RouteState {
  const h = window.location.hash.replace(/^#\/?/, "");
  const [page, runId] = h.split("/");
  const valid: Page[] = ["dashboard", "new", "runs", "run", "workflows", "agents", "mcp", "tools", "memory", "approvals", "reports", "analytics", "settings"];
  if (page && (valid as string[]).includes(page)) return { page: page as Page, runId };
  return { page: "dashboard" };
}

function initialState(): AppState {
  return {
    booted: false, bootStep: 0,
    route: parseHash(),
    feed: [],
    settings: loadSettings(),
    pendingPlan: null,
    openApprovalId: null,
    toasts: [],
    ...buildSeedState(),
  };
}

let state: AppState = initialState();
const listeners = new Set<() => void>();
const approvalResolvers = new Map<string, (ok: boolean) => void>();
const cancelledRuns = new Set<string>();
const feedCounters = new Map<string, number>();
let previewToken = 0;

function set(patch: Partial<AppState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export const store = {
  get: () => state,
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
};

export function useApp(): AppState {
  return useSyncExternalStore(store.subscribe, store.get);
}

// ─────────────────────────── toasts & notifs ───────────────────────────

export function toast(kind: Toast["kind"], title: string, detail?: string) {
  const t: Toast = { id: uid("t"), kind, title, detail };
  set({ toasts: [...state.toasts, t].slice(-4) });
  setTimeout(() => dismissToast(t.id), 4600);
}
export function dismissToast(id: string) {
  set({ toasts: state.toasts.filter((t) => t.id !== id) });
}
function notify(n: Omit<Notif, "id" | "ts" | "read">) {
  set({ notifs: [{ ...n, id: uid("nt"), ts: Date.now(), read: false }, ...state.notifs].slice(0, 24) });
}
export function markNotifsRead() {
  set({ notifs: state.notifs.map((n) => ({ ...n, read: true })) });
}

// ─────────────────────────── navigation ───────────────────────────

export function navigate(page: Page, runId?: string) {
  window.location.hash = runId ? `#/${page}/${runId}` : `#/${page}`;
  set({ route: { page, runId } });
}
window.addEventListener("hashchange", () => set({ route: parseHash() }));

// ─────────────────────────── engine IO ───────────────────────────

const io: EngineIO = {
  sync(run: Run) {
    const prev = feedCounters.get(run.id) ?? 0;
    const fresh = run.events.slice(prev);
    feedCounters.set(run.id, run.events.length);
    set({
      runs: state.runs.map((r) => (r.id === run.id ? { ...run } : r)),
      feed: fresh.length ? [...state.feed, ...fresh].slice(-90) : state.feed,
    });
  },
  approval(ap) {
    const id = uid("ap");
    const approval: Approval = { ...ap, id, createdAt: Date.now(), status: "PENDING" };
    set({ approvals: [approval, ...state.approvals], openApprovalId: id });
    return new Promise<boolean>((resolve) => approvalResolvers.set(id, resolve));
  },
  addReport(rep: Report) { set({ reports: [rep, ...state.reports] }); },
  addMemory(m: MemoryItem) { set({ memories: [m, ...state.memories] }); },
  bumpTotals(d: Partial<Totals>) {
    const t = state.totals;
    set({ totals: { tasks: t.tasks + (d.tasks ?? 0), success: t.success + (d.success ?? 0), mcpCalls: t.mcpCalls + (d.mcpCalls ?? 0), tokens: t.tokens + (d.tokens ?? 0), cost: t.cost + (d.cost ?? 0) } });
  },
  toast,
  notify,
  isCancelled: (id) => cancelledRuns.has(id),
};

// ─────────────────────────── run actions ───────────────────────────

export function startRun(task: string, options: TaskOptions, prePlan?: PlanStep[]): string {
  const run: Run = {
    id: uid("run"), task, status: "RUNNING", createdAt: Date.now(), startedAt: Date.now(),
    progress: 2, plan: prePlan ?? [], events: [], toolCalls: [], findings: [], claims: [],
    approvals: [], recoveries: [], nodeStates: {}, mcpCalls: 0, tokens: 0, cost: 0, options,
  };
  feedCounters.set(run.id, 0);
  set({ runs: [run, ...state.runs], pendingPlan: null });
  void executeRun(run, io, { skipPlanner: Boolean(prePlan && prePlan.length) });
  navigate("run", run.id);
  return run.id;
}

export async function createPlanPreview(task: string, options: TaskOptions) {
  const token = ++previewToken;
  set({ pendingPlan: { task, options, plan: [], thinking: [] } });
  for (const line of THINKING.planner) {
    await sleep(620);
    if (token !== previewToken) return;
    set({ pendingPlan: { task, options, plan: [], thinking: [...(state.pendingPlan?.thinking ?? []), line] } });
  }
  await sleep(500);
  if (token !== previewToken) return;
  const plan = buildPlan(task, options);
  set({ pendingPlan: { task, options, plan, thinking: state.pendingPlan?.thinking ?? [] } });
}

export function cancelRun(id: string) {
  cancelledRuns.add(id);
  toast("info", "Cancel requested", "Checkpointing graph state…");
}

export function decideApproval(id: string, ok: boolean) {
  const resolver = approvalResolvers.get(id);
  approvalResolvers.delete(id);
  set({
    approvals: state.approvals.map((a) => (a.id === id ? { ...a, status: ok ? "APPROVED" : "REJECTED", decidedAt: Date.now() } : a)),
    openApprovalId: state.openApprovalId === id ? null : state.openApprovalId,
  });
  resolver?.(ok);
  toast(ok ? "success" : "warn", ok ? "Approval granted" : "Action rejected", "Graph resumed from checkpoint");
}

export function saveSettings(s: Settings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
  set({ settings: s });
  toast("success", "Settings saved", `${s.provider} · ${s.model}`);
}

// ─────────────────────────── memory search (RAG) ───────────────────────────

export async function memorySearch(query: string): Promise<MemoryItem[]> {
  await sleep(650);
  const q = query.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  const scored = state.memories
    .map((m) => {
      const hay = `${m.title} ${m.snippet} ${m.tags.join(" ")}`.toLowerCase();
      const hits = q.filter((w) => hay.includes(w)).length;
      return { ...m, score: q.length ? Math.min(0.98, 0.55 + (hits / q.length) * 0.45) : 0.86 };
    })
    .filter((m) => (q.length ? m.score > 0.6 : true))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
  return scored;
}

// ─────────────────────────── boot & ambience ───────────────────────────

const BOOT_STEPS = ["Loading orchestrator…", "Connecting MCP registry…", "Discovering 18 tools…", "Warming memory index…", "Restoring checkpoints…"];
export { BOOT_STEPS };

export function boot() {
  if (state.booted) return;
  BOOT_STEPS.forEach((_, i) => setTimeout(() => set({ bootStep: i + 1 }), 260 * (i + 1)));
  setTimeout(() => {
    set({ booted: true });
    toast("info", "Demo Mode active", "Agents, MCP calls and telemetry are simulated in-browser.");
    // resume the seeded mid-flight run from its checkpoint — demonstrates pause/resume live
    const atlas = state.runs.find((r) => r.id === "run-atlas");
    if (atlas && atlas.status === "RUNNING") {
      setTimeout(() => {
        const live = state.runs.find((r) => r.id === "run-atlas");
        if (live && live.status === "RUNNING") void executeRun(live as Run, io, { resume: true, skipPlanner: true, resumeStep: 1, resumeTool: 1 });
      }, 6500);
    }
  }, 260 * BOOT_STEPS.length + 500);

  // live MCP latency jitter + heartbeat
  setInterval(() => {
    if (!state.booted) return;
    set({
      servers: state.servers.map((s) => ({
        ...s,
        latencyMs: Math.max(4, Math.round(s.latencyMs + (Math.random() - 0.5) * s.latencyMs * 0.25)),
        lastSeen: Date.now(),
        status: Math.random() < 0.02 ? "DEGRADED" : "CONNECTED",
      })),
    });
  }, 3200);
}

export function resetDemo() {
  cancelledRuns.clear();
  feedCounters.clear();
  previewToken++;
  const seed = buildSeedState();
  set({ ...seed, feed: [], pendingPlan: null, openApprovalId: null });
  toast("success", "Demo data reset", "Seed runs, reports and memory restored.");
}

export { defaultOptions };
