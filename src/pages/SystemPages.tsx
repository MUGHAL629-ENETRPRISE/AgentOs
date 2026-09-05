import { useState } from "react";
import { Eye, EyeOff, FlaskConical, GitBranch, KeyRound, RotateCcw, Save, ShieldAlert } from "lucide-react";
import { navigate, resetDemo, saveSettings, useApp } from "../lib/store";
import { fmtClock, timeAgo } from "../lib/util";
import { EmptyState, Seg, StatusBadge, Toggle } from "../components/ui";
import { PageHead } from "../components/chrome";
import { ApprovalCard } from "../components/runbits";
import { StateLegend, WorkflowCanvas } from "../components/WorkflowCanvas";
import type { Settings } from "../lib/types";

// ─────────────────────────── approvals ───────────────────────────

export function ApprovalsPage() {
  const s = useApp();
  const pending = s.approvals.filter((a) => a.status === "PENDING");
  const history = s.approvals.filter((a) => a.status !== "PENDING");

  return (
    <div className="animate-fade-up">
      <PageHead title="Human-in-the-Loop" sub="Sensitive MCP writes — GitHub issues, database mutations, deployments — pause the graph at a checkpoint. Approving resumes execution exactly where it stopped; rejecting re-routes the agent to a safe fallback." />
      <section className="mb-5">
        <h3 className="mb-2.5 font-mono text-[10.5px] uppercase tracking-[0.16em] text-warn">Pending · {pending.length}</h3>
        {pending.length === 0
          ? <EmptyState icon={<ShieldAlert size={22} />} title="Queue is clear" hint="When an agent reaches a gated tool call, it pauses here and waits for your decision." />
          : <div className="grid gap-3 lg:grid-cols-2">{pending.map((a) => <ApprovalCard key={a.id} a={a} showRun />)}</div>}
      </section>
      <section>
        <h3 className="mb-2.5 font-mono text-[10.5px] uppercase tracking-[0.16em] text-dim">Decision history</h3>
        {history.length === 0 ? <p className="text-[12px] text-dim">No decisions recorded yet.</p> : (
          <div className="card divide-y divide-edge">
            {history.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <StatusBadge status={a.status} />
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-semibold text-hi">{a.action}</p>
                  <p className="truncate font-mono text-[10px] text-dim">{Object.entries(a.summary).slice(0, 2).map(([k, v]) => `${k}: ${v}`).join(" · ")}</p>
                </div>
                <span className="font-mono text-[10px] text-dim">{a.decidedAt ? `${fmtClock(a.decidedAt)} · ${timeAgo(a.decidedAt)}` : ""}</span>
                <button onClick={() => navigate("run", a.runId)} className="text-[11px] font-semibold text-brand hover:underline">view run →</button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ─────────────────────────── workflows ───────────────────────────

const TEMPLATES = [
  { name: "Deep Research", desc: "Web research → data cross-check → verification → PDF brief.", task: "Research the top 10 AI startups in Europe, compare funding, products and founders, verify the information, and generate a report." },
  { name: "Security Audit", desc: "Repo scan → code search → approval-gated issue creation → report.", task: "Audit our public GitHub repositories for exposed credentials and open tracking issues for critical findings." },
  { name: "Warehouse Brief", desc: "SQL analysis → aggregation → verification → decision memo.", task: "Analyze Q4 churn drivers in the warehouse, compare cohorts by revenue impact, and produce a decision brief." },
];

export function WorkflowsPage() {
  return (
    <div className="animate-fade-up space-y-4">
      <PageHead title="Workflows" sub="The orchestrator is a LangGraph state machine. Conditional edges route each subtask to the right specialized agent, and every sensitive write detours through the approval gate." />
      <div className="grid gap-4 xl:grid-cols-3">
        <section className="card overflow-hidden xl:col-span-2">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-edge px-4 py-3">
            <h3 className="flex items-center gap-2 font-display text-[13.5px] font-semibold text-hi"><GitBranch size={14} className="text-brand" /> Orchestrator blueprint</h3>
            <StateLegend />
          </header>
          <div className="h-[470px]">
            <WorkflowCanvas staticMode />
          </div>
        </section>
        <div className="space-y-4">
          <section className="card p-4">
            <h3 className="mb-3 font-display text-[13.5px] font-semibold text-hi">Templates</h3>
            <div className="space-y-2.5">
              {TEMPLATES.map((t) => (
                <div key={t.name} className="rounded-lg border border-edge bg-ink-850/60 p-3 transition-colors hover:border-edge2">
                  <p className="text-[12.5px] font-semibold text-hi">{t.name}</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-mid">{t.desc}</p>
                  <button onClick={() => { sessionStorage.setItem("agentos.draft", t.task); navigate("new"); }}
                    className="mt-2 rounded-md border border-brand/40 bg-brand/10 px-2.5 py-1 text-[10.5px] font-bold text-brand transition-colors hover:bg-brand/20">
                    Use template →
                  </button>
                </div>
              ))}
            </div>
          </section>
          <section className="card p-4">
            <h3 className="mb-2 font-display text-[13.5px] font-semibold text-hi">Conditional routing</h3>
            <ul className="space-y-1.5 text-[11.5px] leading-relaxed text-mid">
              <li><b className="text-hi">Planner</b> emits typed JSON subtasks with capability requirements.</li>
              <li><b className="text-hi">Router</b> matches capabilities → agents; unused branches stay dormant.</li>
              <li><b className="text-hi">Failures</b> retry with exponential backoff, then fall back to alternative MCP tools.</li>
              <li><b className="text-hi">Approval gate</b> checkpoints the graph; resume continues in place.</li>
              <li><b className="text-hi">Verification</b> scores every claim before the report step.</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── settings ───────────────────────────

export function SettingsPage() {
  const s = useApp();
  const [draft, setDraft] = useState<Settings>({ ...s.settings });
  const [showKey, setShowKey] = useState(false);

  return (
    <div className="animate-fade-up">
      <PageHead title="Settings" sub="Model routing, safety gates and demo controls. Configuration persists locally in this demo build." />
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-4">
          <h3 className="mb-3 font-display text-[13.5px] font-semibold text-hi">Model abstraction</h3>
          <p className="mb-3 text-[11.5px] leading-relaxed text-dim">One interface, any OpenAI-compatible provider — Groq, OpenAI, Gemini-compatible endpoints or local Ollama. Switching providers never touches agent code.</p>
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.14em] text-dim">Provider</span>
              <select value={draft.provider} onChange={(e) => setDraft({ ...draft, provider: e.target.value })}
                className="w-full rounded-lg border border-edge bg-ink-900 px-3 py-2 text-[12.5px] text-hi focus:border-brand/50 focus:outline-none">
                {["Groq", "OpenAI", "Gemini", "Ollama"].map((p) => <option key={p}>{p}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.14em] text-dim">Model name</span>
              <input value={draft.model} onChange={(e) => setDraft({ ...draft, model: e.target.value })}
                className="w-full rounded-lg border border-edge bg-ink-900 px-3 py-2 font-mono text-[12px] text-hi focus:border-brand/50 focus:outline-none" />
            </label>
            <label className="block">
              <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.14em] text-dim">Temperature — {draft.temperature.toFixed(2)}</span>
              <input type="range" min={0} max={1} step={0.05} value={draft.temperature} onChange={(e) => setDraft({ ...draft, temperature: +e.target.value })} className="w-full" />
            </label>
            <label className="block">
              <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.14em] text-dim">Max tokens</span>
              <input type="number" value={draft.maxTokens} onChange={(e) => setDraft({ ...draft, maxTokens: +e.target.value })}
                className="w-full rounded-lg border border-edge bg-ink-900 px-3 py-2 font-mono text-[12px] text-hi focus:border-brand/50 focus:outline-none" />
            </label>
            <label className="block">
              <span className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-dim"><KeyRound size={10} /> API key — never leaves this browser in demo mode</span>
              <div className="relative">
                <input type={showKey ? "text" : "password"} value={draft.apiKey} onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })} placeholder={`${draft.provider.toLowerCase()}-••••••••••••`}
                  className="w-full rounded-lg border border-edge bg-ink-900 px-3 py-2 pr-10 font-mono text-[12px] text-hi focus:border-brand/50 focus:outline-none" />
                <button onClick={() => setShowKey(!showKey)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-dim hover:text-hi" aria-label="Toggle key visibility">
                  {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </label>
          </div>
        </section>

        <div className="space-y-4">
          <section className="card p-4">
            <h3 className="mb-1 font-display text-[13.5px] font-semibold text-hi">Safety & behavior</h3>
            <Toggle on={draft.requireApproval} onChange={(v) => setDraft({ ...draft, requireApproval: v })} label="Human-in-the-loop gates" desc="Pause on create_issue, insert_record, update_record" />
            <Toggle on={draft.webResearch} onChange={(v) => setDraft({ ...draft, webResearch: v })} label="Web research by default" desc="New tasks may call the Web MCP server" />
            <Toggle on={draft.useMemory} onChange={(v) => setDraft({ ...draft, useMemory: v })} label="Long-term memory recall" desc="Retrieve from Qdrant before researching" />
            <Toggle on={draft.telemetry} onChange={(v) => setDraft({ ...draft, telemetry: v })} label="Structured telemetry" desc="Emit task_id / run_id / tool / duration traces" />
          </section>

          <section className="card border-warn/25 p-4">
            <h3 className="mb-2 flex items-center gap-2 font-display text-[13.5px] font-semibold text-warn"><FlaskConical size={14} /> Demo Mode</h3>
            <p className="text-[11.5px] leading-relaxed text-mid">Agents, MCP servers, tool results, failures and approvals are simulated in-browser against the same event protocol the FastAPI + LangGraph backend streams over SSE. Reset to restore seed runs, reports and memory.</p>
            <button onClick={resetDemo} className="mt-3 flex items-center gap-2 rounded-lg border border-warn/40 bg-warn/10 px-3.5 py-2 text-[12px] font-semibold text-warn transition-colors hover:bg-warn/20">
              <RotateCcw size={13} /> Reset demo data
            </button>
          </section>

          <button onClick={() => saveSettings(draft)}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand py-3 text-[13px] font-bold text-ink-950 shadow-lg shadow-brand/20 transition-all hover:brightness-110 active:scale-[0.99]">
            <Save size={14} /> Save settings
          </button>
        </div>
      </div>
    </div>
  );
}
