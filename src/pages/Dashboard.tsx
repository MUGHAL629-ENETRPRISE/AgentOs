import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, ArrowRight, Bot, CheckCircle2, Coins, Cpu, Plus, ShieldAlert, Timer, Wrench, Zap } from "lucide-react";
import { navigate, useApp } from "../lib/store";
import { fmtDec, fmtMoney, fmtNum, fmtTokens, timeAgo, useCountUp } from "../lib/util";
import { EmptyState, StatCard } from "../components/ui";
import { PageHead } from "../components/chrome";
import { ApprovalCard, ExecutionTimeline, LiveDot, RunCard } from "../components/runbits";

function Animated({ n, fmt }: { n: number; fmt: (v: number) => string }) {
  const v = useCountUp(n);
  return <>{fmt(v)}</>;
}

export function Dashboard() {
  const s = useApp();
  const liveRuns = s.runs.filter((r) => ["RUNNING", "AWAITING_APPROVAL", "QUEUED"].includes(r.status));
  const done = s.runs.filter((r) => r.status === "COMPLETED" || r.status === "FAILED");
  const rate = s.totals.tasks ? (s.totals.success / s.totals.tasks) * 100 : 0;
  const activeAgents = s.agents.filter((a) => a.status === "ACTIVE").length + new Set(liveRuns.map((r) => r.activeAgent).filter(Boolean)).size;
  const avgS = s.dayStats.reduce((a, d) => a + d.avgS, 0) / (s.dayStats.length || 1);
  const sparkTasks = s.dayStats.slice(-14).map((d) => d.tasks);
  const sparkMcp = s.dayStats.slice(-14).map((d) => d.mcp);
  const sparkTok = s.dayStats.slice(-14).map((d) => d.tokens);
  const pending = s.approvals.filter((a) => a.status === "PENDING");

  return (
    <div className="animate-fade-up space-y-5">
      <PageHead title="Command Center" sub="Live overview of the multi-agent fleet, MCP registry and in-flight executions.">
        <button onClick={() => navigate("new")}
          className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-[12.5px] font-bold text-ink-950 shadow-lg shadow-brand/20 transition-all hover:brightness-110 active:scale-[0.97]">
          <Plus size={14} /> New Task
        </button>
      </PageHead>

      {/* stat grid */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Tasks completed" value={<Animated n={s.totals.tasks} fmt={(v) => fmtNum(v)} />} icon={<CheckCircle2 size={15} />} sub={`${s.totals.tasks - s.totals.success} failed · all time`} spark={sparkTasks} />
        <StatCard label="Success rate" value={<Animated n={rate} fmt={(v) => `${fmtDec(v)}%`} />} icon={<Activity size={15} />} accent="text-ok" sub="rolling across all runs" />
        <StatCard label="Active agents" value={<Animated n={activeAgents} fmt={(v) => fmtNum(v)} />} icon={<Bot size={15} />} accent="text-run" sub={`of ${s.agents.length} registered · 6 specialized + router`} />
        <StatCard label="MCP calls" value={<Animated n={s.totals.mcpCalls} fmt={(v) => fmtNum(v)} />} icon={<Wrench size={15} />} accent="text-data" sub="18 tools · 4 servers" spark={sparkMcp} />
        <StatCard label="Avg execution" value={<Animated n={avgS} fmt={(v) => `${fmtDec(v)}s`} />} icon={<Timer size={15} />} accent="text-warn" sub="plan → verify → report" />
        <StatCard label="Token usage" value={<Animated n={s.totals.tokens} fmt={(v) => fmtTokens(v)} />} icon={<Zap size={15} />} accent="text-run" sub="input + output, all agents" spark={sparkTok} />
        <StatCard label="Estimated cost" value={<Animated n={s.totals.cost} fmt={(v) => fmtMoney(v)} />} icon={<Coins size={15} />} accent="text-ok" sub="blended $3.20 / 1M tokens" />
        <StatCard label="Active runs" value={<Animated n={liveRuns.length} fmt={(v) => fmtNum(v)} />} icon={<Cpu size={15} />} accent={liveRuns.length ? "text-brand" : "text-dim"} sub={liveRuns.length ? "executing now" : "fleet idle"} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {/* left column */}
        <div className="space-y-4 xl:col-span-2">
          <section className="card p-4">
            <header className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-display text-[13.5px] font-semibold text-hi">
                {liveRuns.length > 0 && <LiveDot />} Active Runs
              </h3>
              <button onClick={() => navigate("runs")} className="flex items-center gap-1 text-[11.5px] text-brand hover:underline">all runs <ArrowRight size={11} /></button>
            </header>
            {liveRuns.length === 0
              ? <EmptyState icon={<Cpu size={22} />} title="No active runs" hint="Submit an objective and watch the fleet plan, execute and verify it live.">
                <button onClick={() => navigate("new")} className="mt-1 rounded-lg border border-brand/40 bg-brand/10 px-3 py-1.5 text-[11.5px] font-semibold text-brand transition-colors hover:bg-brand/20">Start a task</button>
              </EmptyState>
              : <div className="space-y-2.5">{liveRuns.map((r) => <RunCard key={r.id} run={r} />)}</div>}
            {done.length > 0 && (
              <div className="mt-4 border-t border-edge pt-3">
                <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-dim">Recent</p>
                <div className="space-y-1">
                  {done.slice(0, 3).map((r) => (
                    <button key={r.id} onClick={() => navigate("run", r.id)} className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-ink-800/60">
                      <CheckCircle2 size={13} className={r.status === "COMPLETED" ? "shrink-0 text-ok" : "shrink-0 text-bad"} />
                      <span className="min-w-0 flex-1 truncate text-[12px] text-mid">{r.task}</span>
                      <span className="shrink-0 font-mono text-[10px] text-dim">{timeAgo(r.startedAt)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="card p-4">
            <header className="mb-2 flex items-center justify-between">
              <h3 className="font-display text-[13.5px] font-semibold text-hi">Throughput — last 14 days</h3>
              <span className="font-mono text-[10px] text-dim">tasks / day</span>
            </header>
            <div className="h-[150px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={s.dayStats.slice(-14)} margin={{ top: 6, right: 4, left: -22, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gTasks" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2dd4bf" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="#2dd4bf" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#16222f" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: "#5c7189", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} interval={2} />
                  <YAxis tick={{ fill: "#5c7189", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "#111a26", border: "1px solid #1e2d3e", borderRadius: 8, fontSize: 11, fontFamily: "JetBrains Mono" }} labelStyle={{ color: "#8fa3b8" }} cursor={{ stroke: "#25384e" }} />
                  <Area type="monotone" dataKey="tasks" stroke="#2dd4bf" strokeWidth={1.8} fill="url(#gTasks)" name="tasks" />
                  <Area type="monotone" dataKey="failed" stroke="#fb7185" strokeWidth={1.4} fill="transparent" name="failed" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>

        {/* right column */}
        <div className="space-y-4">
          <section className="card p-4">
            <header className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-display text-[13.5px] font-semibold text-hi"><LiveDot /> Live event stream</h3>
              <span className="font-mono text-[10px] text-dim">SSE · demo</span>
            </header>
            <ExecutionTimeline events={s.feed.slice(-40)} maxHeight={300} live={liveRuns.length > 0} />
          </section>

          <section className="card p-4">
            <header className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-[13.5px] font-semibold text-hi">MCP registry</h3>
              <button onClick={() => navigate("mcp")} className="text-[11.5px] text-brand hover:underline">manage</button>
            </header>
            <div className="space-y-2">
              {s.servers.map((sv) => (
                <button key={sv.id} onClick={() => navigate("mcp")} className="flex w-full items-center gap-2.5 rounded-lg border border-edge bg-ink-850/50 px-3 py-2 text-left transition-colors hover:border-edge2">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${sv.status === "CONNECTED" ? "animate-pulse-soft bg-ok" : "bg-warn"}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-medium text-hi">{sv.name}</span>
                    <span className="block font-mono text-[9.5px] text-dim">{sv.tools.length} tools</span>
                  </span>
                  <span className="shrink-0 font-mono text-[10.5px] text-mid">{sv.latencyMs}ms</span>
                </button>
              ))}
            </div>
          </section>

          <section className="card p-4">
            <header className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-display text-[13.5px] font-semibold text-hi"><ShieldAlert size={14} className="text-warn" /> Approvals</h3>
              <button onClick={() => navigate("approvals")} className="text-[11.5px] text-brand hover:underline">queue</button>
            </header>
            {pending.length === 0
              ? <p className="rounded-lg border border-dashed border-edge px-3 py-6 text-center text-[11.5px] text-dim">No actions waiting. Sensitive tool calls will pause here.</p>
              : <div className="space-y-2.5">{pending.slice(0, 2).map((a) => <ApprovalCard key={a.id} a={a} showRun />)}</div>}
          </section>
        </div>
      </div>
    </div>
  );
}
