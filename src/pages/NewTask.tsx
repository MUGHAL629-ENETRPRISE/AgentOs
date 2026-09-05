import { useMemo, useState } from "react";
import { ArrowRight, Bot, Check, Compass, ListChecks, Loader2, Play, Radar, Sparkles, Wrench, X } from "lucide-react";
import type { TaskOptions } from "../lib/types";
import { createPlanPreview, defaultOptions, navigate, startRun, useApp } from "../lib/store";
import { cx, timeAgo } from "../lib/util";
import { Kbd, Seg, StatusBadge, Toggle } from "../components/ui";
import { PageHead } from "../components/chrome";

const EXAMPLES = [
  "Research the top 10 AI startups in Europe, compare funding, products and founders, find open engineering positions, verify the information, and generate a report.",
  "Audit our public GitHub repositories for exposed credentials and open tracking issues for critical findings.",
  "Compare vector database benchmarks (Qdrant, Milvus, Weaviate) and produce a decision brief.",
  "Analyze Q4 churn drivers in the warehouse and summarize the top three cohorts by revenue impact.",
];

const PROVIDERS: Record<string, string[]> = {
  Groq: ["llama-3.3-70b", "llama-3.1-8b-instant", "mixtral-8x7b"],
  OpenAI: ["gpt-4o", "gpt-4o-mini", "o3-mini"],
  Gemini: ["gemini-2.0-flash", "gemini-1.5-pro"],
  Ollama: ["qwen2.5:32b", "llama3.2:3b", "mistral-nemo"],
};

const AGENT_ICON = { planner: <Compass size={12} />, research: <Radar size={12} />, data: <Wrench size={12} />, coding: <Bot size={12} />, verification: <Sparkles size={12} />, report: <ListChecks size={12} /> } as Record<string, React.ReactNode>;

export function NewTask() {
  const s = useApp();
  const [task, setTask] = useState(() => {
    const draft = sessionStorage.getItem("agentos.draft");
    if (draft) sessionStorage.removeItem("agentos.draft");
    return draft ?? "";
  });
  const [opts, setOpts] = useState<TaskOptions>({ ...defaultOptions(), provider: s.settings.provider, model: s.settings.model, requireApproval: s.settings.requireApproval, webResearch: s.settings.webResearch, useMemory: s.settings.useMemory });
  const planReady = Boolean(s.pendingPlan && s.pendingPlan.plan.length > 0);
  const planning = Boolean(s.pendingPlan && s.pendingPlan.plan.length === 0);
  const canRun = task.trim().length >= 12;

  const run = () => { if (canRun) startRun(task.trim(), opts); };
  const recent = useMemo(() => s.runs.slice(0, 5), [s.runs]);

  return (
    <div className="animate-fade-up">
      <PageHead title="New Task" sub="Describe a complex objective — the Planner will decompose it, route subtasks to specialized agents and execute them through the MCP registry." />

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          {/* objective input */}
          <section className="card p-4">
            <label htmlFor="objective" className="mb-2 block font-mono text-[10.5px] uppercase tracking-[0.16em] text-dim">
              What do you want the agents to accomplish?
            </label>
            <textarea
              id="objective" value={task} onChange={(e) => setTask(e.target.value)}
              onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") run(); }}
              rows={6}
              placeholder="Research the top 10 AI startups in Europe, compare funding, products and founders, find open engineering positions, verify the information, and generate a report."
              className="w-full resize-none rounded-xl border border-edge bg-ink-900/70 px-4 py-3 text-[13.5px] leading-relaxed text-hi placeholder:text-dim/60 focus:border-brand/50 focus:outline-none focus:ring-2 focus:ring-brand/15"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="font-mono text-[10px] text-dim">{task.trim().length} chars</span>
              <span className="ml-auto hidden items-center gap-1 font-mono text-[10px] text-dim sm:flex"><Kbd>⌘</Kbd><Kbd>↵</Kbd> to run</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {EXAMPLES.map((ex, i) => (
                <button key={i} onClick={() => setTask(ex)}
                  className="max-w-full truncate rounded-full border border-edge bg-ink-800/70 px-3 py-1 text-[11px] text-mid transition-colors hover:border-brand/40 hover:text-brand">
                  {ex.split(",")[0]}…
                </button>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={run} disabled={!canRun}
                className={cx("flex items-center gap-2 rounded-lg px-5 py-2.5 text-[13px] font-bold transition-all", canRun ? "bg-brand text-ink-950 shadow-lg shadow-brand/20 hover:brightness-110 active:scale-[0.97]" : "cursor-not-allowed bg-ink-700 text-dim")}>
                <Play size={14} /> Run Task
              </button>
              <button onClick={() => canRun && createPlanPreview(task.trim(), opts)} disabled={!canRun || planning}
                className={cx("flex items-center gap-2 rounded-lg border px-5 py-2.5 text-[13px] font-semibold transition-all", canRun && !planning ? "border-edge bg-ink-800 text-hi hover:border-brand/50 hover:text-brand" : "cursor-not-allowed border-edge bg-ink-850 text-dim")}>
                {planning ? <Loader2 size={14} className="animate-spin" /> : <ListChecks size={14} />} {planning ? "Planning…" : "Create Plan"}
              </button>
            </div>
          </section>

          {/* plan preview */}
          {s.pendingPlan && (
            <section className="card animate-fade-up border-brand/30 p-4">
              <header className="mb-3 flex items-center justify-between">
                <h3 className="flex items-center gap-2 font-display text-[13.5px] font-semibold text-hi">
                  <Compass size={14} className="text-brand" /> Execution plan {planReady && <StatusBadge status="SUCCESS" />}
                </h3>
                <button onClick={() => navigate("new")} className="rounded-md p-1 text-dim hover:bg-ink-700 hover:text-hi" aria-label="Discard plan"><X size={14} /></button>
              </header>
              <div className="inset-panel mb-3 space-y-1 p-3">
                {s.pendingPlan.thinking.map((t, i) => (
                  <p key={i} className="flex items-center gap-2 font-mono text-[11px] text-mid">
                    <Sparkles size={11} className="shrink-0 text-brand" /> {t}
                  </p>
                ))}
                {planning && <p className="flex items-center gap-2 font-mono text-[11px] text-run"><Loader2 size={11} className="animate-spin" /> synthesizing plan…</p>}
              </div>
              {planReady && (
                <>
                  <ol className="space-y-2">
                    {s.pendingPlan!.plan.map((step, i) => (
                      <li key={step.id} className="flex gap-3 rounded-lg border border-edge bg-ink-850/60 p-3">
                        <span className="num flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand/10 text-[12px] font-bold text-brand">{i + 1}</span>
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-2 text-[12.5px] font-semibold text-hi">
                            {AGENT_ICON[step.agent]} {step.title}
                            <span className="rounded border border-edge bg-ink-700/60 px-1.5 py-px font-mono text-[9.5px] capitalize text-mid">{step.agent} agent</span>
                          </p>
                          <p className="mt-0.5 text-[11.5px] text-mid">{step.description}</p>
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {step.tools.map((t) => <span key={t} className="rounded border border-run/25 bg-run/[0.07] px-1.5 py-px font-mono text-[9.5px] text-run">{t}</span>)}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                  <div className="mt-4 flex gap-2">
                    <button onClick={() => startRun(s.pendingPlan!.task, s.pendingPlan!.options, s.pendingPlan!.plan)}
                      className="flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-[13px] font-bold text-ink-950 shadow-lg shadow-brand/20 transition-all hover:brightness-110 active:scale-[0.97]">
                      <Play size={14} /> Execute plan <ArrowRight size={13} />
                    </button>
                    <p className="self-center font-mono text-[10.5px] text-dim">graph will skip planning and execute this checkpoint</p>
                  </div>
                </>
              )}
            </section>
          )}

          {/* options */}
          <section className="card p-4">
            <h3 className="mb-3 font-display text-[13.5px] font-semibold text-hi">Execution options</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-3">
                <Field label="Model provider">
                  <select value={opts.provider} onChange={(e) => { const p = e.target.value; setOpts({ ...opts, provider: p, model: PROVIDERS[p][0] }); }}
                    className="w-full rounded-lg border border-edge bg-ink-900 px-3 py-2 text-[12.5px] text-hi focus:border-brand/50 focus:outline-none">
                    {Object.keys(PROVIDERS).map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </Field>
                <Field label="Model">
                  <select value={opts.model} onChange={(e) => setOpts({ ...opts, model: e.target.value })}
                    className="w-full rounded-lg border border-edge bg-ink-900 px-3 py-2 font-mono text-[12px] text-hi focus:border-brand/50 focus:outline-none">
                    {PROVIDERS[opts.provider]?.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </Field>
                <Field label="Output format">
                  <Seg options={[{ v: "PDF", label: "PDF" }, { v: "MD", label: "Markdown" }, { v: "JSON", label: "JSON" }]} value={opts.outputFormat} onChange={(v) => setOpts({ ...opts, outputFormat: v })} />
                </Field>
              </div>
              <div className="space-y-1">
                <Field label={`Max execution time — ${opts.maxDurationS}s`}>
                  <input type="range" min={60} max={900} step={30} value={opts.maxDurationS} onChange={(e) => setOpts({ ...opts, maxDurationS: +e.target.value })} className="w-full" />
                </Field>
                <Field label={`Max tool calls — ${opts.maxToolCalls}`}>
                  <input type="range" min={10} max={100} step={5} value={opts.maxToolCalls} onChange={(e) => setOpts({ ...opts, maxToolCalls: +e.target.value })} className="w-full" />
                </Field>
                <div className="pt-1">
                  <Toggle on={opts.webResearch} onChange={(v) => setOpts({ ...opts, webResearch: v })} label="Enable web research" desc="Research Agent may use the Web MCP server" />
                  <Toggle on={opts.useMemory} onChange={(v) => setOpts({ ...opts, useMemory: v })} label="Enable long-term memory" desc="Recall relevant findings from Qdrant before researching" />
                  <Toggle on={opts.verify} onChange={(v) => setOpts({ ...opts, verify: v })} label="Verify findings" desc="Verification Agent cross-checks claims and scores confidence" />
                  <Toggle on={opts.requireApproval} onChange={(v) => setOpts({ ...opts, requireApproval: v })} label="Require human approval" desc="Pause on sensitive writes (create_issue, DB mutations)" />
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* right rail */}
        <div className="space-y-4">
          <section className="card p-4">
            <h3 className="mb-3 font-display text-[13.5px] font-semibold text-hi">Orchestration path</h3>
            <ol className="space-y-0">
              {["Planner decomposes the objective", "Router assigns specialized agents", "Agents execute tools via MCP", "Failures retry → fallback tools", "Verification scores confidence", "Sensitive writes pause for you", "Report generated & stored"].map((step, i, arr) => (
                <li key={i} className="relative flex gap-3 pb-3 last:pb-0">
                  {i < arr.length - 1 && <span className="absolute left-[9px] top-5 h-full w-px bg-edge" />}
                  <span className="relative z-10 mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border border-brand/40 bg-ink-850 font-mono text-[9px] text-brand">{i + 1}</span>
                  <span className="text-[11.5px] leading-relaxed text-mid">{step}</span>
                </li>
              ))}
            </ol>
          </section>
          <section className="card p-4">
            <h3 className="mb-3 font-display text-[13.5px] font-semibold text-hi">Recent objectives</h3>
            <div className="space-y-1">
              {recent.map((r) => (
                <button key={r.id} onClick={() => setTask(r.task)} className="group w-full rounded-lg px-2 py-2 text-left transition-colors hover:bg-ink-800/60">
                  <p className="line-clamp-2 text-[11.5px] leading-snug text-mid group-hover:text-hi">{r.task}</p>
                  <p className="mt-0.5 flex items-center gap-2 font-mono text-[9.5px] text-dim"><Check size={9} className={r.status === "COMPLETED" ? "text-ok" : "text-bad"} /> {timeAgo(r.startedAt)} · {r.toolCalls.length} tools</p>
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-dim">{label}</p>
      {children}
    </div>
  );
}
