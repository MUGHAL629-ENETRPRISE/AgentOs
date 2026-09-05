// ─────────────────────────────────────────────────────────────
// AgentOS orchestration engine
// A faithful in-browser implementation of the LangGraph workflow:
//   planner → router → specialized agents → MCP tool execution
//   → verification → (approval gates) → report generation
// Supports checkpoint resume (pause on approval, resume in place),
// retry with exponential backoff, fallback tools, and graceful
// termination. Emits the same event protocol the SSE feed of the
// FastAPI backend would stream.
// ─────────────────────────────────────────────────────────────

import type {
  AgentId, Approval, EventType, GraphNodeId, MemoryItem, Notif,
  PlanStep, RecoveryEntry, Report, Run, RunEvent, TaskOptions, Toast, ToolCall, Totals,
} from "./types";
import { CLAIMS_POOL, FINDINGS_POOL, THINKING, buildMarkdown } from "./data";
import { between, sleep, uid } from "./util";

export interface EngineIO {
  sync(run: Run): void;
  approval(ap: Omit<Approval, "id" | "createdAt" | "status">): Promise<boolean>;
  addReport(rep: Report): void;
  addMemory(m: MemoryItem): void;
  bumpTotals(d: Partial<Totals>): void;
  toast(kind: Toast["kind"], title: string, detail?: string): void;
  notify(n: Omit<Notif, "id" | "ts" | "read">): void;
  isCancelled(runId: string): boolean;
}

class Cancelled extends Error {}

const AGENT_NAME: Record<AgentId, string> = {
  planner: "Planner Agent", research: "Research Agent", data: "Data Agent",
  coding: "Coding Agent", verification: "Verification Agent", report: "Report Agent",
};

const SENSITIVE = new Set(["create_issue", "insert_record", "update_record"]);

export function serverForTool(tool: string): string {
  if (["search_web", "fetch_url", "extract_content", "summarize_page"].includes(tool)) return "mcp-web";
  if (tool.startsWith("search_repo") || ["get_repository", "get_issues", "get_pull_requests", "search_code", "create_issue"].includes(tool)) return "mcp-github";
  if (["query_database", "insert_record", "update_record"].includes(tool)) return "mcp-postgres";
  return "mcp-files";
}

const rand = () => Math.random();

// ─────────────────────────── plan synthesis ───────────────────────────

export function buildPlan(task: string, options: TaskOptions): PlanStep[] {
  const t = task.toLowerCase();
  const has = (...ws: string[]) => ws.some((w) => t.includes(w));
  const short = task.split(/[,.!?]/)[0].trim();
  const steps: PlanStep[] = [];

  const researchWanted = options.webResearch || has("research", "find", "discover", "top", "compare", "market", "startup", "benchmark", "analyze", "ecosystem", "jobs", "positions", "map", "survey");
  const dataWanted = has("funding", "revenue", "data", "warehouse", "sql", "metric", "churn", "cohort", "calculate", "forecast", "arr", "compare", "pricing", "benchmark", "growth");
  const codeWanted = has("github", "repo", "code", "issue", "vulnerab", "secret", "audit", "pull request", "deploy");

  if (researchWanted) steps.push({
    id: uid("st"), agent: "research", title: `Research — ${lcFirst(short.slice(0, 58))}`,
    description: "Search the web, extract primary sources, collect entities and figures, and flag conflicts.",
    tools: ["search_web", "fetch_url", "extract_content"], status: "PENDING",
  });
  if (dataWanted) steps.push({
    id: uid("st"), agent: "data", title: "Structured analysis & computation",
    description: "Query the warehouse for structured records, compute aggregates, deltas and rankings.",
    tools: ["query_database", "query_database"], status: "PENDING",
  });
  if (codeWanted) steps.push({
    id: uid("st"), agent: "coding", title: "Repository audit & issue triage",
    description: "Scan repositories, triage findings by severity and open tracking issues for critical hits.",
    tools: ["search_repositories", "search_code", ...(options.requireApproval ? ["create_issue"] : ["get_issues"])], status: "PENDING",
  });
  if (options.verify && (researchWanted || codeWanted)) steps.push({
    id: uid("st"), agent: "verification", title: "Cross-verify findings",
    description: "Extract claims, compare against independent sources, score confidence.",
    tools: ["search_web"], status: "PENDING",
  });
  const reportTools = options.outputFormat === "PDF"
    ? ["create_markdown", "create_pdf", "save_file"]
    : options.outputFormat === "MD" ? ["create_markdown", "save_file"] : ["save_file"];
  steps.push({
    id: uid("st"), agent: "report", title: `Generate ${options.outputFormat} report`,
    description: "Synthesize verified findings into the final structured artifact and persist it.",
    tools: reportTools, status: "PENDING",
  });
  return steps;
}

const lcFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

// ─────────────────────────── run helpers ───────────────────────────

function ev(run: Run, type: EventType, message: string, agent?: AgentId, detail?: string) {
  run.events = [...run.events, { id: uid("ev"), ts: Date.now(), runId: run.id, type, agent, message, detail } as RunEvent];
}
function setNode(run: Run, node: GraphNodeId, s: NonNullable<Run["nodeStates"][GraphNodeId]>) {
  run.nodeStates = { ...run.nodeStates, [node]: s };
}
function patchStep(run: Run, stepId: string, p: Partial<PlanStep>) {
  run.plan = run.plan.map((s) => (s.id === stepId ? { ...s, ...p } : s));
}
function upsertTool(run: Run, tc: ToolCall) {
  const i = run.toolCalls.findIndex((c) => c.id === tc.id);
  run.toolCalls = i >= 0 ? run.toolCalls.map((c) => (c.id === tc.id ? tc : c)) : [...run.toolCalls, tc];
}

async function wait(ms: number, run: Run, io: EngineIO) {
  const chunks = Math.max(1, Math.ceil(ms / 140));
  for (let i = 0; i < chunks; i++) {
    if (io.isCancelled(run.id)) throw new Cancelled();
    await sleep(ms / chunks);
  }
}

async function think(run: Run, agent: AgentId, io: EngineIO, lines = 2) {
  const pool = THINKING[agent].map((l) => l.replace("{n}", "3"));
  for (const line of pool.slice(0, lines)) {
    ev(run, "agent.thinking", line, agent);
    io.sync(run);
    await wait(between(rand, 520, 940), run, io);
  }
}

// ─────────────────────────── tool simulation ───────────────────────────

function simulateResult(tool: string, task: string): { result: unknown; tokens: number } {
  const r = rand;
  const tokens = Math.round(between(r, 320, 1450));
  switch (tool) {
    case "search_web":
      return { tokens, result: { total: 24, results: FINDINGS_POOL.slice(0, 4).map((f, i) => ({ position: i + 1, title: f.title, url: `https://${f.source}/articles/${i + 11}`, snippet: f.detail.slice(0, 96) + "…" })) } };
    case "fetch_url":
      return { tokens, result: { url: "https://sifted.eu/articles/eu-ai-funding-2025", chars: 18432, status: 200 } };
    case "extract_content":
      return { tokens, result: { entities: 17, figures: ["€1.7B", "$2.1B", "$1.05B"], text: "European AI investment concentrated in frontier models and applied verticals…" } };
    case "summarize_page":
      return { tokens, result: { summary: "Round-up of European AI funding activity; Mistral, DeepL and Synthesia lead late-stage rounds.", keyPoints: ["Mistral >€1.7B raised", "Synthesia $2.1B valuation", "Wayve $1.05B SoftBank-led"] } };
    case "query_database":
      return { tokens, result: { rowCount: 5, rows: FINDINGS_POOL.slice(0, 5).map((f) => ({ company: f.title.split(" ")[0], metric: "funding_total", value: `€${(between(r, 40, 900)).toFixed(0)}M` })) } };
    case "search_repositories":
      return { tokens, result: { total: 14, items: [{ full_name: "acme-labs/billing-api", stars: 214, language: "TypeScript" }, { full_name: "acme-labs/deploy-tools", stars: 87, language: "Python" }, { full_name: "acme-labs/ml-platform", stars: 402, language: "Python" }] } };
    case "get_repository":
      return { tokens, result: { full_name: "acme-labs/billing-api", stars: 214, open_issues: 7, license: "MIT", default_branch: "main" } };
    case "get_issues":
      return { tokens, result: { items: [{ number: 118, title: "Flaky webhook retries", state: "open", labels: ["bug"] }, { number: 121, title: "Rotate staging keys", state: "open", labels: ["security"] }] } };
    case "search_code":
      return { tokens, result: { hits: 2, files: ["src/config/env.ts", "scripts/deploy.sh"], pattern: "AKIA[0-9A-Z]{16}" } };
    case "create_issue":
      return { tokens, result: { number: 142, state: "open", url: "https://github.com/acme-labs/billing-api/issues/142" } };
    case "create_markdown":
      return { tokens: Math.round(tokens * 1.6), result: { path: `/reports/${slug(task)}.md`, bytes: 14830 } };
    case "create_pdf":
      return { tokens: Math.round(tokens * 1.8), result: { path: `/reports/${slug(task)}.pdf`, pages: 9, bytes: 482_113 } };
    case "create_csv":
      return { tokens, result: { path: `/reports/${slug(task)}.csv`, rows: 24 } };
    case "save_file":
      return { tokens, result: { path: `/workspace/artifacts/${slug(task)}`, bytes: 486_943, sha: "9f3c…b21e" } };
    case "list_files":
      return { tokens, result: { files: [`${slug(task)}.pdf`, `${slug(task)}.md`, "sources.json"] } };
    default:
      return { tokens, result: { ok: true } };
  }
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 42) || "report";

// ─────────────────────────── step execution ───────────────────────────

interface StepOpts { startTool?: number; failTool?: string; failFallback?: string }

async function runStep(run: Run, step: PlanStep, io: EngineIO, opts: StepOpts = {}) {
  const started = Date.now();
  patchStep(run, step.id, { status: "RUNNING" });
  run.activeAgent = step.agent;
  setNode(run, step.agent, "RUNNING");
  ev(run, "agent.started", `${AGENT_NAME[step.agent]} started — ${step.title}`, step.agent);
  io.sync(run);
  await think(run, step.agent, io);

  if (step.agent === "research" && run.options.useMemory) {
    ev(run, "agent.thinking", "Recalled 3 relevant memories from Qdrant (similarity ≥ 0.81)…", step.agent);
    io.sync(run);
    await wait(700, run, io);
  }

  const startTool = opts.startTool ?? 0;
  for (let i = startTool; i < step.tools.length; i++) {
    const tool = step.tools[i];
    const server = serverForTool(tool);

    if (SENSITIVE.has(tool) && run.options.requireApproval) {
      const approved = await gateApproval(run, step, tool, io);
      if (!approved) {
        // human rejected the write → agent adapts with a safe local fallback
        const rej: ToolCall = { id: uid("tc"), runId: run.id, agent: step.agent, server, tool, args: approvalArgs(tool, run), status: "REJECTED", startedAt: Date.now(), durationMs: 0, attempt: 1, error: "Rejected by human operator — graph re-routed to safe fallback", tokens: 0 };
        upsertTool(run, rej);
        run.mcpCalls += 1;
        ev(run, "agent.thinking", "Approval rejected — falling back to a local draft artifact instead of writing.", step.agent);
        io.sync(run);
        await runToolOnce(run, step, "save_file", "mcp-files", io, { args: { payload: "draft (write rejected by operator)" } });
        continue;
      }
    }

    if (opts.failTool === tool) {
      await runToolWithRecovery(run, step, tool, server, io, opts.failFallback ?? "summarize_page");
    } else {
      await runToolOnce(run, step, tool, server, io);
    }
  }

  if (step.agent === "research") collectFindings(run, "research");
  if (step.agent === "coding") collectFindings(run, "coding");
  if (step.agent === "verification") await verify(run, io);

  patchStep(run, step.id, { status: "COMPLETED", durationMs: Date.now() - started });
  setNode(run, step.agent, "SUCCESS");
  const done = run.plan.filter((p) => p.status === "COMPLETED").length;
  run.progress = Math.min(97, Math.round((done / run.plan.length) * 100));
  ev(run, "agent.completed", `${step.title} — completed`, step.agent);
  ev(run, "step.completed", `Step ${done}/${run.plan.length} completed`, step.agent);
  io.sync(run);
  await wait(between(rand, 300, 600), run, io);
}

async function runToolOnce(run: Run, step: PlanStep, tool: string, server: string, io: EngineIO, over?: { args?: Record<string, unknown> }) {
  const args = over?.args ?? toolArgs(tool, run);
  const tc: ToolCall = { id: uid("tc"), runId: run.id, agent: step.agent, server, tool, args, status: "RUNNING", startedAt: Date.now(), durationMs: 0, attempt: 1, tokens: 0 };
  upsertTool(run, tc);
  ev(run, "tool.started", `${tool} · ${serverLabel(server)}`, step.agent, JSON.stringify(args).slice(0, 120));
  io.sync(run);
  const latency = between(rand, 520, 1500);
  await wait(latency, run, io);
  const { result, tokens } = simulateResult(tool, run.task);
  upsertTool(run, { ...tc, status: "SUCCESS", durationMs: Math.round(latency), result, tokens });
  run.mcpCalls += 1; run.tokens += tokens; run.cost = (run.tokens / 1e6) * 3.2;
  ev(run, "tool.completed", `${tool} → success (${(latency / 1000).toFixed(2)}s)`, step.agent);
  io.sync(run);
}

async function runToolWithRecovery(run: Run, step: PlanStep, tool: string, server: string, io: EngineIO, fallback: string) {
  const args = toolArgs(tool, run);
  const failures = ["ETIMEDOUT after 5000ms", "HTTP 429 — rate limit exceeded"];
  for (let attempt = 1; attempt <= 2; attempt++) {
    const tc: ToolCall = { id: uid("tc"), runId: run.id, agent: step.agent, server, tool, args, status: "RUNNING", startedAt: Date.now(), durationMs: 0, attempt, tokens: 0 };
    upsertTool(run, tc);
    ev(run, attempt === 1 ? "tool.started" : "tool.retry", attempt === 1 ? `${tool} · ${serverLabel(server)}` : `Retry ${attempt - 1}/2 — exponential backoff ${attempt * 700}ms`, step.agent);
    io.sync(run);
    await wait(between(rand, 800, 1400), run, io);
    const err = failures[attempt - 1];
    upsertTool(run, { ...tc, status: "FAILED", durationMs: Math.round(between(rand, 900, 1400)), error: err, tokens: Math.round(between(rand, 80, 160)) });
    run.mcpCalls += 1;
    ev(run, "tool.failed", `${tool} failed — ${err}`, step.agent);
    io.sync(run);
    await wait(attempt * 700, run, io); // exponential backoff
  }
  // retry budget exhausted → alternative tool
  ev(run, "tool.retry", `Retries exhausted — switching to alternative tool ${fallback}`, step.agent);
  io.sync(run);
  const entry: RecoveryEntry = { id: uid("rc"), tool, server, failures, fallbackTool: fallback, resolution: "Alternative tool succeeded after retry budget exhausted", recoveredAt: Date.now() };
  run.recoveries = [...run.recoveries, entry];
  await runToolOnce(run, step, fallback, serverForTool(fallback), io);
  ev(run, "run.recovered", `Failure recovered — ${tool} → ${fallback}`, step.agent, entry.resolution);
  io.sync(run);
}

function approvalArgs(tool: string, run: Run): Record<string, unknown> {
  if (tool === "create_issue") return { repo: "acme-labs/billing-api", title: "Security: hard-coded AWS key pattern detected", labels: ["security", "agent-os"] };
  if (tool === "insert_record") return { table: "research.findings", rows: run.findings.length || 4 };
  return { table: "analytics.labels", filter: "cohort = '2025-Q1'" };
}

function toolArgs(tool: string, run: Run): Record<string, unknown> {
  const q = run.task.slice(0, 80);
  switch (tool) {
    case "search_web": return { query: q, num: 8, region: "eu" };
    case "fetch_url": return { url: "https://sifted.eu/articles/eu-ai-funding-2025" };
    case "extract_content": return { url: "https://sifted.eu/articles/eu-ai-funding-2025", mode: "article" };
    case "summarize_page": return { url: "https://sifted.eu/articles/eu-ai-funding-2025", max_words: 220 };
    case "query_database": return { sql: "SELECT company, funding_total, round FROM ai_companies WHERE region='EU' ORDER BY funding_total DESC LIMIT 10" };
    case "search_repositories": return { q: "org:acme-labs", sort: "updated" };
    case "get_repository": return { repo: "acme-labs/billing-api" };
    case "get_issues": return { repo: "acme-labs/billing-api", state: "open" };
    case "search_code": return { q: "AKIA repo:acme-labs/billing-api" };
    case "create_issue": return approvalArgs("create_issue", run);
    case "create_markdown": return { path: `/reports/${slug(run.task)}.md` };
    case "create_pdf": return { path: `/reports/${slug(run.task)}.pdf`, template: "research-brief" };
    case "create_csv": return { path: `/reports/${slug(run.task)}.csv` };
    case "save_file": return { path: `/workspace/artifacts/${slug(run.task)}` };
    default: return { query: q };
  }
}

const serverLabel = (id: string) => ({ "mcp-web": "Web Research", "mcp-github": "GitHub", "mcp-postgres": "PostgreSQL", "mcp-files": "Files" }[id] ?? id);

// ─────────────────────────── approval gate ───────────────────────────

async function gateApproval(run: Run, step: PlanStep, tool: string, io: EngineIO): Promise<boolean> {
  const args = approvalArgs(tool, run);
  const action = tool === "create_issue" ? "Create GitHub Issue" : tool === "insert_record" ? "Insert database record" : "Update database record";
  setNode(run, "approval", "PAUSED");
  run.status = "AWAITING_APPROVAL";
  ev(run, "approval.required", `Human approval required — ${action}`, step.agent, "Graph paused at checkpoint; will resume in place.");
  io.sync(run);
  io.toast("warn", "Action requires approval", `${AGENT_NAME[step.agent]} wants to execute ${tool}`);
  io.notify({ kind: "warn", title: `Approval required — ${action}`, detail: run.task.slice(0, 80), runId: run.id });

  const ok = await io.approval({
    runId: run.id, agent: step.agent, action, tool, server: serverForTool(tool),
    description: tool === "create_issue"
      ? "Code search found 2 files matching a hard-coded AWS access-key pattern. The Coding Agent proposes opening a tracking issue with a rotation checklist."
      : "The agent wants to persist structured results into the warehouse.",
    summary: Object.fromEntries(Object.entries(args).map(([k, v]) => [k[0].toUpperCase() + k.slice(1), String(typeof v === "object" ? JSON.stringify(v) : v)])),
    risk: tool === "create_issue" ? "HIGH" : "MEDIUM",
  });

  const ap: Approval = {
    id: uid("ap"), runId: run.id, agent: step.agent, action, tool, server: serverForTool(tool),
    description: "", summary: Object.fromEntries(Object.entries(args).map(([k, v]) => [k, String(v)])),
    risk: tool === "create_issue" ? "HIGH" : "MEDIUM", status: ok ? "APPROVED" : "REJECTED",
    createdAt: Date.now(), decidedAt: Date.now(),
  };
  run.approvals = [...run.approvals, ap];
  run.status = "RUNNING";
  setNode(run, "approval", ok ? "SUCCESS" : "SKIPPED");
  ev(run, ok ? "approval.granted" : "approval.rejected", ok ? `Approval granted — resuming graph at checkpoint` : `Approval rejected — graph re-routing around ${tool}`, step.agent);
  io.sync(run);
  await wait(500, run, io);
  return ok;
}

// ─────────────────────────── findings / verification / report ───────────────────────────

function collectFindings(run: Run, agent: "research" | "coding") {
  if (run.findings.length >= 5) return;
  const pool = agent === "research" ? FINDINGS_POOL.slice(0, 5) : [
    { title: "Hard-coded AWS key pattern in 2 files", detail: "search_code matched `AKIA…` in src/config/env.ts and scripts/deploy.sh on the default branch.", source: "github.com/acme-labs", confidence: 0.97 },
    { title: "CI logs leak staging tokens", detail: "Workflow logs print base64-encoded staging credentials on failure paths.", source: "github.com/acme-labs", confidence: 0.89 },
  ];
  const next = pool.slice(0, agent === "research" ? 3 : 2).filter((f) => !run.findings.some((x) => x.title === f.title));
  run.findings = [...run.findings, ...next.map((f) => ({ ...f, id: uid("fd"), agent }))];
}

async function verify(run: Run, io: EngineIO) {
  const claims = CLAIMS_POOL.slice(0, run.findings.length > 3 ? 4 : 3).map((c) => ({ ...c, id: uid("cl") }));
  run.claims = claims;
  const verified = claims.filter((c) => c.verified).length;
  const avg = claims.reduce((a, c) => a + c.confidence, 0) / claims.length;
  ev(run, "verification.completed", `${verified}/${claims.length} claims verified · avg confidence ${avg.toFixed(2)}`, "verification");
  io.sync(run);
  await wait(400, run, io);
}

function buildReport(run: Run): Report {
  const title = run.task.split(/[.!?]/)[0].slice(0, 90);
  const toolsByAgent = run.toolCalls.reduce<Record<string, number>>((a, c) => ((a[c.agent] = (a[c.agent] ?? 0) + 1), a), {});
  const sections: Report["sections"] = [
    {
      heading: "Executive Summary",
      body: [
        `${run.findings.length || "Several"} primary findings were collected across ${run.plan.length} orchestrated steps and ${run.mcpCalls} MCP tool calls.`,
        run.claims.length
          ? `Verification confirmed ${run.claims.filter((c) => c.verified).length}/${run.claims.length} claims (avg confidence ${(run.claims.reduce((a, c) => a + c.confidence, 0) / run.claims.length).toFixed(2)}).`
          : "Verification was skipped for this run configuration.",
      ],
    },
    { heading: "Methodology", body: [
      "- Multi-agent pipeline orchestrated as a LangGraph state machine (plan → route → execute → verify → report).",
      `- All tools executed through the MCP registry (${run.mcpCalls} calls across ${new Set(run.toolCalls.map((c) => c.server)).size} servers).`,
      "- Checkpointing enabled: sensitive writes paused for human approval and resumed in place.",
      run.recoveries.length ? `- ${run.recoveries.length} failure(s) recovered via backoff + alternative tools.` : "- No unrecovered failures encountered.",
    ] },
    { heading: "Findings", body: run.findings.length ? run.findings.map((f) => `- **${f.title}** — ${f.detail} (source: ${f.source}, confidence ${f.confidence.toFixed(2)})`) : ["- No findings were produced by this run."] },
    ...(run.claims.length ? [{ heading: "Verified Claims", body: run.claims.map((c) => `- ${c.claim} — confidence ${c.confidence.toFixed(2)} · ${c.verified ? "VERIFIED" : `UNVERIFIED${c.contradictions ? ` (${c.contradictions})` : ""}`}`) }] : []),
    { heading: "Sources", body: Array.from(new Set(run.findings.map((f) => f.source))).map((s) => `- ${s}`) },
    { heading: "Agent Activity", body: Object.entries(toolsByAgent).map(([a, n]) => `- ${AGENT_NAME[a as AgentId]} — ${n} tool call${n > 1 ? "s" : ""}`) },
    { heading: "Conclusion", body: [
      "Evidence is consistent across independent sources; contradictions are flagged inline with adjusted confidence.",
      `Total token usage ${run.tokens.toLocaleString("en-US")} · estimated cost $${run.cost.toFixed(2)}.`,
    ] },
  ];
  return {
    id: uid("rep"), runId: run.id, title, createdAt: Date.now(),
    format: run.options.outputFormat === "MD" ? "MD" : "PDF",
    pages: run.options.outputFormat === "JSON" ? 1 : Math.max(4, 3 + run.findings.length),
    tokens: Math.round(run.tokens * 0.14), sections, markdown: buildMarkdown(title, sections),
    tags: ["live-run", ...(run.claims.length ? ["verified"] : [])],
  };
}

// ─────────────────────────── main execution ───────────────────────────

export interface ExecOpts { skipPlanner?: boolean; resumeStep?: number; resumeTool?: number; resume?: boolean }

export async function executeRun(run: Run, io: EngineIO, opts: ExecOpts = {}) {
  try {
    if (opts.resume) {
      ev(run, "run.recovered", "Resumed from checkpoint — graph state restored, continuing in place");
      io.sync(run);
      await wait(900, run, io);
    }

    if (opts.skipPlanner && !opts.resume) {
      run.nodeStates = { ...run.nodeStates, planner: "SUCCESS", router: "SUCCESS" };
      ev(run, "task.started", "Objective received — executing approved plan");
      ev(run, "plan.created", `Loaded approved plan from preview · ${run.plan.length} steps`, "planner");
      io.sync(run);
      await wait(450, run, io);
    }

    if (!opts.skipPlanner) {
      setNode(run, "planner", "RUNNING");
      run.activeAgent = "planner";
      ev(run, "task.started", "Objective received — spinning up orchestrator");
      ev(run, "agent.started", "Planner Agent started — decomposing objective", "planner");
      io.sync(run);
      await think(run, "planner", io, 3);
      if (run.plan.length === 0) run.plan = buildPlan(run.task, run.options);
      setNode(run, "planner", "SUCCESS");
      setNode(run, "router", "SUCCESS");
      ev(run, "plan.created", `Plan created · ${run.plan.length} steps · routed to ${run.plan.length} agents`, "planner", run.plan.map((s) => `${AGENT_NAME[s.agent]}: ${s.title}`).join(" → "));
      io.sync(run);
      await wait(600, run, io);
    }

    const startStep = opts.resumeStep ?? 0;
    // failure script: force one recovery chain in the first research step (fetch_url → summarize_page)
    const firstResearch = run.plan.findIndex((s) => s.agent === "research" && s.tools.includes("fetch_url"));

    for (let i = startStep; i < run.plan.length; i++) {
      const step = run.plan[i];
      if (step.status === "COMPLETED" || step.status === "SKIPPED") continue;
      const so: StepOpts = i === opts.resumeStep ? { startTool: opts.resumeTool ?? 0 } : {};
      if (i === firstResearch && !opts.resume) { so.failTool = "fetch_url"; so.failFallback = "summarize_page"; }
      await runStep(run, step, io, so);
    }

    // report step already produced the artifact inside runStep? → build it once, after last step
    const report = buildReport(run);
    io.addReport(report);
    run.reportId = report.id;
    run.progress = 100;
    run.status = "COMPLETED";
    run.endedAt = Date.now();
    run.activeAgent = undefined;
    run.summary = `${run.findings.length} findings · ${run.mcpCalls} MCP calls · ${run.claims.filter((c) => c.verified).length}/${run.claims.length} claims verified · report saved`;
    ev(run, "task.completed", "Run completed — report persisted to workspace", undefined, run.summary);
    io.sync(run);

    io.bumpTotals({ tasks: 1, success: 1, mcpCalls: run.mcpCalls, tokens: run.tokens, cost: run.cost });
    io.addMemory({
      id: uid("mem"), type: "report", title: run.task.slice(0, 72), snippet: run.summary ?? "",
      tags: ["live-run", ...(run.findings[0] ? [run.findings[0].source.split(".")[0]] : [])],
      createdAt: Date.now(), source: run.id,
    });
    io.notify({ kind: "success", title: "Run completed", detail: run.task.slice(0, 80), runId: run.id });
    io.toast("success", "Run completed", report.title.slice(0, 60));
  } catch (e) {
    if (e instanceof Cancelled) {
      run.status = "CANCELLED"; run.endedAt = Date.now(); run.activeAgent = undefined;
      ev(run, "task.cancelled", "Run cancelled by operator — state checkpointed");
      io.sync(run);
      io.toast("info", "Run cancelled", run.task.slice(0, 60));
      return;
    }
    run.status = "FAILED"; run.endedAt = Date.now();
    ev(run, "task.failed", "Run terminated — unrecoverable error", undefined, String(e));
    io.sync(run);
    io.bumpTotals({ tasks: 1 });
    io.notify({ kind: "error", title: "Run failed", detail: run.task.slice(0, 80), runId: run.id });
    io.toast("error", "Run failed", String(e).slice(0, 80));
  }
}
