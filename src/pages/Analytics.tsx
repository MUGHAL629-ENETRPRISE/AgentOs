import { useMemo, useState } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Coins, Timer, Wrench, Zap } from "lucide-react";
import { useApp } from "../lib/store";
import { fmtDec, fmtMoney, fmtNum, fmtTokens } from "../lib/util";
import { Seg, StatCard } from "../components/ui";
import { PageHead } from "../components/chrome";

type Range = "today" | "7d" | "30d" | "all";
const RANGE_DAYS: Record<Range, number> = { today: 1, "7d": 7, "30d": 30, all: 30 };
const PIE_COLORS = ["#2dd4bf", "#38bdf8", "#60a5fa", "#fbbf24"];

const TOOLTIP_STYLE = { background: "#111a26", border: "1px solid #1e2d3e", borderRadius: 8, fontSize: 11, fontFamily: "JetBrains Mono" } as const;

export function Analytics() {
  const s = useApp();
  const [range, setRange] = useState<Range>("7d");
  const days = RANGE_DAYS[range];
  const slice = useMemo(() => s.dayStats.slice(-days), [s.dayStats, days]);
  const chartSlice = slice.length > 1 ? slice : s.dayStats.slice(-7);

  const tasks = slice.reduce((a, d) => a + d.tasks, 0);
  const failed = slice.reduce((a, d) => a + d.failed, 0);
  const tokens = slice.reduce((a, d) => a + d.tokens, 0);
  const cost = slice.reduce((a, d) => a + d.cost, 0);
  const mcp = slice.reduce((a, d) => a + d.mcp, 0);
  const avgS = slice.reduce((a, d) => a + d.avgS, 0) / (slice.length || 1);
  const rate = tasks ? ((tasks - failed) / tasks) * 100 : 0;

  const agentUsage = s.agents.map((a) => ({ name: a.name.replace(" Agent", ""), runs: a.runs24h }));
  const mcpUsage = s.servers.map((sv) => ({ name: sv.name, value: sv.calls24h }));
  const perf = chartSlice.map((d) => ({ ...d, rate: d.tasks ? ((d.tasks - d.failed) / d.tasks) * 100 : 100 }));

  return (
    <div className="animate-fade-up space-y-4">
      <PageHead title="Analytics" sub="Fleet performance, agent utilization and spend across the orchestration platform.">
        <Seg<Range>
          options={[{ v: "today", label: "Today" }, { v: "7d", label: "7 days" }, { v: "30d", label: "30 days" }, { v: "all", label: "All time" }]}
          value={range} onChange={setRange}
        />
      </PageHead>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Tasks" value={fmtNum(tasks)} icon={<Timer size={15} />} sub={`${fmtNum(failed)} failed in range`} />
        <StatCard label="Success rate" value={`${fmtDec(rate)}%`} icon={<Zap size={15} />} accent="text-ok" sub="completed / total" />
        <StatCard label="MCP calls" value={fmtNum(mcp)} icon={<Wrench size={15} />} accent="text-data" sub={`avg ${fmtDec(avgS)}s per run`} />
        <StatCard label="Spend" value={fmtMoney(cost)} icon={<Coins size={15} />} accent="text-warn" sub={`${fmtTokens(tokens)} tokens`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Tasks per day" note="completed vs failed">
          <ResponsiveContainer width="100%" height={210}>
            <AreaChart data={chartSlice} margin={{ top: 6, right: 4, left: -24, bottom: 0 }}>
              <defs>
                <linearGradient id="gOk" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34d399" stopOpacity={0.25} /><stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#16222f" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "#5c7189", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} interval={Math.ceil(chartSlice.length / 7)} />
              <YAxis tick={{ fill: "#5c7189", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: "#8fa3b8" }} cursor={{ stroke: "#25384e" }} />
              <Area type="monotone" dataKey="success" name="completed" stroke="#34d399" strokeWidth={1.8} fill="url(#gOk)" />
              <Area type="monotone" dataKey="failed" name="failed" stroke="#fb7185" strokeWidth={1.4} fill="transparent" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Execution performance" note="avg seconds · success %">
          <ResponsiveContainer width="100%" height={210}>
            <LineChart data={perf} margin={{ top: 6, right: 4, left: -24, bottom: 0 }}>
              <CartesianGrid stroke="#16222f" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "#5c7189", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} interval={Math.ceil(perf.length / 7)} />
              <YAxis yAxisId="l" tick={{ fill: "#5c7189", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="r" orientation="right" domain={[0, 100]} tick={{ fill: "#5c7189", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: "#8fa3b8" }} cursor={{ stroke: "#25384e" }} />
              <Line yAxisId="l" type="monotone" dataKey="avgS" name="avg s" stroke="#38bdf8" strokeWidth={1.8} dot={false} />
              <Line yAxisId="r" type="monotone" dataKey="rate" name="success %" stroke="#2dd4bf" strokeWidth={1.6} dot={false} strokeDasharray="5 4" />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Agent usage" note="runs · last 24h">
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={agentUsage} margin={{ top: 6, right: 4, left: -24, bottom: 0 }}>
              <CartesianGrid stroke="#16222f" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: "#5c7189", fontSize: 9.5, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} interval={0} />
              <YAxis tick={{ fill: "#5c7189", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: "#8fa3b8" }} cursor={{ fill: "#16222f" }} />
              <Bar dataKey="runs" radius={[4, 4, 0, 0]}>
                {agentUsage.map((_, i) => <Cell key={i} fill={["#2dd4bf", "#38bdf8", "#60a5fa", "#818cf8", "#fbbf24", "#34d399"][i % 6]} fillOpacity={0.85} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="MCP server share" note="calls · last 24h">
          <div className="flex h-[210px] items-center">
            <ResponsiveContainer width="55%" height="100%">
              <PieChart>
                <Pie data={mcpUsage} dataKey="value" nameKey="name" innerRadius={52} outerRadius={78} paddingAngle={3} stroke="none">
                  {mcpUsage.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} fillOpacity={0.85} />)}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: "#8fa3b8" }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-2 pr-2">
              {mcpUsage.map((m, i) => (
                <div key={m.name} className="flex items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                  <span className="flex-1 truncate text-[11px] text-mid">{m.name}</span>
                  <span className="font-mono text-[10.5px] text-hi">{fmtNum(m.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </ChartCard>
      </div>
    </div>
  );
}

function ChartCard({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <section className="card p-4">
      <header className="mb-2 flex items-center justify-between">
        <h3 className="font-display text-[13.5px] font-semibold text-hi">{title}</h3>
        <span className="font-mono text-[10px] text-dim">{note}</span>
      </header>
      {children}
    </section>
  );
}
