import { useMemo, useState } from "react";
import { Bot, Compass, Database, FileText, Github, Globe, Lock, Radar, Search, Server, TerminalSquare, Wrench, Zap } from "lucide-react";
import { useApp } from "../lib/store";
import { cx, fmtNum, timeAgo } from "../lib/util";
import { EmptyState, Modal, StatusBadge } from "../components/ui";
import { PageHead } from "../components/chrome";
import { ToolCallRow } from "../components/runbits";

// ─────────────────────────── agents ───────────────────────────

const AGENT_ICON: Record<string, React.ReactNode> = {
  planner: <Compass size={17} />, research: <Radar size={17} />, data: <Database size={17} />,
  coding: <TerminalSquare size={17} />, verification: <Zap size={17} />, report: <FileText size={17} />,
};

export function AgentsPage() {
  const s = useApp();
  return (
    <div className="animate-fade-up">
      <PageHead title="Agent Registry" sub="Six specialized agents plus the planner/router layer. Each declares its capabilities and the MCP servers it may call." />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {s.agents.map((a) => {
          const active = s.runs.some((r) => r.activeAgent === a.id && ["RUNNING", "AWAITING_APPROVAL"].includes(r.status));
          return (
            <div key={a.id} className="card card-hover flex flex-col p-4">
              <div className="flex items-start justify-between gap-2">
                <span className={cx("flex h-9 w-9 items-center justify-center rounded-lg border", active ? "border-run/40 bg-run/10 text-run" : "border-edge bg-ink-800 text-brand")}>{AGENT_ICON[a.id]}</span>
                <StatusBadge status={active ? "ACTIVE" : a.status} />
              </div>
              <h3 className="mt-3 font-display text-[14px] font-semibold text-hi">{a.name}</h3>
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-dim">{a.role}</p>
              <p className="mt-2 flex-1 text-[11.5px] leading-relaxed text-mid">{a.description}</p>
              <div className="mt-3 flex flex-wrap gap-1">
                {a.capabilities.map((c) => <span key={c} className="rounded border border-edge bg-ink-800/70 px-1.5 py-0.5 font-mono text-[9.5px] text-mid">{c}</span>)}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 border-t border-edge pt-3">
                <MiniStat label="runs 24h" value={String(a.runs24h)} />
                <MiniStat label="success" value={`${a.successRate}%`} tone="text-ok" />
                <MiniStat label="avg" value={`${a.avgDurationS}s`} />
              </div>
              <p className="mt-2 flex items-center gap-1.5 font-mono text-[10px] text-dim">
                <Bot size={10} /> {a.model} · {a.mcpServers.length ? a.mcpServers.map((m) => s.servers.find((x) => x.id === m)?.name).join(", ") : "no MCP (internal)"}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <p className={cx("num text-[14px] font-semibold", tone ?? "text-hi")}>{value}</p>
      <p className="font-mono text-[9px] uppercase tracking-wider text-dim">{label}</p>
    </div>
  );
}

// ─────────────────────────── MCP servers ───────────────────────────

const SERVER_ICON: Record<string, React.ReactNode> = {
  "mcp-web": <Globe size={16} />, "mcp-github": <Github size={16} />,
  "mcp-postgres": <Database size={16} />, "mcp-files": <FileText size={16} />,
};

export function MCPPage() {
  const s = useApp();
  const [openId, setOpenId] = useState<string | null>(null);
  const server = s.servers.find((x) => x.id === openId);
  const recentCalls = useMemo(
    () => s.runs.flatMap((r) => r.toolCalls).filter((t) => t.server === openId).sort((a, b) => b.startedAt - a.startedAt).slice(0, 8),
    [s.runs, openId]);

  return (
    <div className="animate-fade-up">
      <PageHead title="MCP Servers" sub="The tool-integration layer. Agents never call tools directly — every execution is routed through the Model Context Protocol registry." />
      <div className="grid gap-3 md:grid-cols-2">
        {s.servers.map((sv) => (
          <button key={sv.id} onClick={() => setOpenId(sv.id)} className="card card-hover p-4 text-left">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-edge bg-ink-800 text-brand">{SERVER_ICON[sv.id]}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-display text-[14px] font-semibold text-hi">{sv.name}</h3>
                  <StatusBadge status={sv.status} />
                </div>
                <p className="truncate font-mono text-[10px] text-dim">{sv.endpoint}</p>
              </div>
            </div>
            <p className="mt-2.5 text-[11.5px] leading-relaxed text-mid">{sv.description}</p>
            <div className="mt-3 grid grid-cols-4 gap-2 border-t border-edge pt-3">
              <MiniStat label="tools" value={String(sv.tools.length)} />
              <MiniStat label="latency" value={`${sv.latencyMs}ms`} tone={sv.latencyMs < 200 ? "text-ok" : "text-warn"} />
              <MiniStat label="calls 24h" value={fmtNum(sv.calls24h)} />
              <MiniStat label="errors" value={String(sv.errors24h)} tone={sv.errors24h > 5 ? "text-warn" : "text-hi"} />
            </div>
            <p className="mt-2 font-mono text-[9.5px] text-dim">last seen {timeAgo(sv.lastSeen)} · v{sv.version}</p>
          </button>
        ))}
      </div>

      <Modal open={Boolean(server)} onClose={() => setOpenId(null)} wide title={
        server && <span className="flex items-center gap-2">{SERVER_ICON[server.id]} {server.name} <StatusBadge status={server.status} /></span>
      }>
        {server && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <InfoCell k="Endpoint" v={server.endpoint} />
              <InfoCell k="Version" v={server.version} />
              <InfoCell k="Calls 24h" v={fmtNum(server.calls24h)} />
              <InfoCell k="Errors 24h" v={String(server.errors24h)} />
            </div>
            <div>
              <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-dim">Tools · {server.tools.length}</p>
              <div className="space-y-1.5">
                {server.tools.map((t) => (
                  <div key={t.name} className="flex items-center gap-3 rounded-lg border border-edge bg-ink-850/50 px-3 py-2">
                    <Wrench size={12} className="shrink-0 text-brand" />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-1.5 font-mono text-[11.5px] font-semibold text-hi">
                        {t.name}
                        <span className={cx("rounded border px-1 py-px text-[8.5px]", t.category === "write" ? "border-warn/30 bg-warn/10 text-warn" : "border-run/25 bg-run/[0.07] text-run")}>{t.category}</span>
                        {t.requiresApproval && <span className="flex items-center gap-0.5 rounded border border-warn/30 bg-warn/10 px-1 py-px text-[8.5px] text-warn"><Lock size={8} /> approval</span>}
                      </p>
                      <p className="truncate text-[10.5px] text-dim">{t.description}</p>
                    </div>
                    <span className="shrink-0 text-right font-mono text-[9.5px] text-dim">{fmtNum(t.calls24h)} calls<br />{t.avgMs}ms avg</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-dim">Recent calls</p>
              {recentCalls.length === 0
                ? <p className="rounded-lg border border-dashed border-edge px-3 py-5 text-center text-[11.5px] text-dim">No recent calls for this server in the current session.</p>
                : <div className="space-y-2">{recentCalls.map((tc) => <ToolCallRow key={tc.id} tc={tc} />)}</div>}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function InfoCell({ k, v }: { k: string; v: string }) {
  return (
    <div className="inset-panel px-2.5 py-2">
      <p className="font-mono text-[9px] uppercase tracking-wider text-dim">{k}</p>
      <p className="mt-0.5 truncate font-mono text-[10.5px] text-hi">{v}</p>
    </div>
  );
}

// ─────────────────────────── tool call inspector ───────────────────────────

export function ToolCallsPage() {
  const s = useApp();
  const [server, setServer] = useState("all");
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");

  const all = useMemo(() => s.runs.flatMap((r) => r.toolCalls).sort((a, b) => b.startedAt - a.startedAt), [s.runs]);
  const filtered = all.filter((t) =>
    (server === "all" || t.server === server) &&
    (status === "all" || t.status === status) &&
    (q === "" || t.tool.includes(q.toLowerCase()) || t.agent.includes(q.toLowerCase())));

  return (
    <div className="animate-fade-up">
      <PageHead title="Tool Call Inspector" sub={`${fmtNum(all.length)} executions across the MCP registry. Expand any call to inspect its JSON arguments and result.`} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dim" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by tool or agent…"
            className="w-56 rounded-lg border border-edge bg-ink-850 py-2 pl-8 pr-3 text-[12px] text-hi placeholder:text-dim focus:border-brand/50 focus:outline-none" />
        </div>
        <select value={server} onChange={(e) => setServer(e.target.value)} className="rounded-lg border border-edge bg-ink-850 px-3 py-2 text-[12px] text-hi focus:border-brand/50 focus:outline-none">
          <option value="all">All servers</option>
          {s.servers.map((sv) => <option key={sv.id} value={sv.id}>{sv.name}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-edge bg-ink-850 px-3 py-2 text-[12px] text-hi focus:border-brand/50 focus:outline-none">
          <option value="all">All statuses</option>
          {["SUCCESS", "FAILED", "RUNNING", "REJECTED"].map((st) => <option key={st} value={st}>{st}</option>)}
        </select>
        <span className="ml-auto font-mono text-[10.5px] text-dim">{filtered.length} shown</span>
      </div>
      {filtered.length === 0
        ? <EmptyState icon={<Server size={22} />} title="No tool calls match" hint="Adjust the filters, or run a task to generate MCP traffic." />
        : <div className="space-y-2">{filtered.slice(0, 40).map((tc) => <ToolCallRow key={tc.id} tc={tc} />)}</div>}
    </div>
  );
}
