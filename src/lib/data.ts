import type {
  AgentDef, AgentId, Approval, AppState, Claim, DayStat, Finding, MCPServer,
  MemoryItem, Notif, PlanStep, Report, ReportSection, Run, RunEvent, TaskOptions, ToolCall,
} from "./types";
import { between, rng, uid } from "./util";

// ─────────────────────────── MCP registry ───────────────────────────

const now = Date.now();

export const SERVERS_SEED: MCPServer[] = [
  {
    id: "mcp-web", name: "Web Research", description: "Search & extraction over the open web via Serper + Readability pipeline.",
    endpoint: "stdio://mcp-web:8101", status: "CONNECTED", latencyMs: 184, lastSeen: now - 4_000,
    calls24h: 642, errors24h: 9, version: "1.4.2",
    tools: [
      { name: "search_web", description: "Run a web search and return ranked results with snippets.", category: "read", calls24h: 318, avgMs: 920 },
      { name: "fetch_url", description: "Fetch a URL and return raw page content.", category: "read", calls24h: 176, avgMs: 1240 },
      { name: "extract_content", description: "Extract the main content of a page as clean text.", category: "read", calls24h: 98, avgMs: 640 },
      { name: "summarize_page", description: "Fetch + summarize a page in one round-trip.", category: "read", calls24h: 50, avgMs: 1480 },
    ],
  },
  {
    id: "mcp-github", name: "GitHub", description: "Repository, issue and code-search integration. Write ops are approval-gated.",
    endpoint: "stdio://mcp-github:8102", status: "CONNECTED", latencyMs: 96, lastSeen: now - 2_000,
    calls24h: 411, errors24h: 3, version: "2.0.1",
    tools: [
      { name: "search_repositories", description: "Search repositories by topic, language or stars.", category: "read", calls24h: 132, avgMs: 480 },
      { name: "get_repository", description: "Fetch metadata for a single repository.", category: "read", calls24h: 97, avgMs: 310 },
      { name: "get_issues", description: "List issues with label & state filters.", category: "read", calls24h: 88, avgMs: 390 },
      { name: "get_pull_requests", description: "List open pull requests for a repository.", category: "read", calls24h: 41, avgMs: 420 },
      { name: "search_code", description: "Code search across repositories with qualifiers.", category: "read", calls24h: 47, avgMs: 730 },
      { name: "create_issue", description: "Create a GitHub issue. Requires human approval.", category: "write", calls24h: 6, avgMs: 860, requiresApproval: true },
    ],
  },
  {
    id: "mcp-postgres", name: "PostgreSQL", description: "Read/write access to the analytics warehouse. Mutations are approval-gated.",
    endpoint: "http://mcp-database:8103/mcp", status: "CONNECTED", latencyMs: 12, lastSeen: now - 900,
    calls24h: 509, errors24h: 1, version: "0.9.7",
    tools: [
      { name: "query_database", description: "Run a read-only SQL query and return rows.", category: "read", calls24h: 402, avgMs: 96 },
      { name: "insert_record", description: "Insert a row. Requires human approval.", category: "write", calls24h: 2, avgMs: 140, requiresApproval: true },
      { name: "update_record", description: "Update rows by filter. Requires human approval.", category: "write", calls24h: 1, avgMs: 150, requiresApproval: true },
    ],
  },
  {
    id: "mcp-files", name: "Files", description: "Workspace file system: markdown, PDF, CSV generation and storage.",
    endpoint: "stdio://mcp-files:8104", status: "CONNECTED", latencyMs: 8, lastSeen: now - 1_200,
    calls24h: 262, errors24h: 0, version: "1.1.0",
    tools: [
      { name: "create_markdown", description: "Write a markdown document to the workspace.", category: "write", calls24h: 74, avgMs: 42 },
      { name: "create_pdf", description: "Render sections into a paginated PDF report.", category: "write", calls24h: 61, avgMs: 1900 },
      { name: "create_csv", description: "Serialize tabular findings to CSV.", category: "write", calls24h: 38, avgMs: 30 },
      { name: "save_file", description: "Persist an arbitrary payload to object storage.", category: "write", calls24h: 55, avgMs: 120 },
      { name: "list_files", description: "List workspace files with sizes and mtimes.", category: "read", calls24h: 34, avgMs: 18 },
    ],
  },
];

// ─────────────────────────── agents ───────────────────────────

export const AGENTS_SEED: AgentDef[] = [
  {
    id: "planner", name: "Planner Agent", role: "Decomposition & routing", model: "llama-3.3-70b",
    description: "Parses the objective, decomposes it into typed subtasks, selects capabilities and emits a structured execution plan.",
    capabilities: ["Objective parsing", "Task decomposition", "Capability matching", "Plan JSON emission"],
    mcpServers: [], runs24h: 31, successRate: 99.1, avgDurationS: 2.4, status: "IDLE",
  },
  {
    id: "research", name: "Research Agent", role: "Web intelligence", model: "llama-3.3-70b",
    description: "Searches the web, extracts and cross-reads sources, summarizes findings and flags conflicting information.",
    capabilities: ["Multi-query search", "Content extraction", "Source collection", "Conflict detection"],
    mcpServers: ["mcp-web"], runs24h: 28, successRate: 96.4, avgDurationS: 11.8, status: "ACTIVE",
  },
  {
    id: "data", name: "Data Agent", role: "Structured analysis", model: "llama-3.3-70b",
    description: "Queries the warehouse, transforms structured data and computes aggregates, deltas and rankings.",
    capabilities: ["SQL generation", "Aggregations", "Transforms", "Trend computation"],
    mcpServers: ["mcp-postgres"], runs24h: 19, successRate: 98.2, avgDurationS: 6.1, status: "IDLE",
  },
  {
    id: "coding", name: "Coding Agent", role: "Repository operations", model: "llama-3.3-70b",
    description: "Inspects repositories, triages issues and proposes code changes. Write operations pause for human approval.",
    capabilities: ["Repo analysis", "Code search", "Issue triage", "Patch suggestion"],
    mcpServers: ["mcp-github"], runs24h: 12, successRate: 94.7, avgDurationS: 9.3, status: "IDLE",
  },
  {
    id: "verification", name: "Verification Agent", role: "Fact checking", model: "llama-3.3-70b",
    description: "Cross-checks claims against collected sources, detects unsupported statements and assigns confidence scores.",
    capabilities: ["Claim extraction", "Source comparison", "Contradiction detection", "Confidence scoring"],
    mcpServers: ["mcp-web", "mcp-postgres"], runs24h: 24, successRate: 97.8, avgDurationS: 4.9, status: "IDLE",
  },
  {
    id: "report", name: "Report Agent", role: "Synthesis & output", model: "llama-3.3-70b",
    description: "Merges verified findings into structured Markdown/PDF reports and persists them to the workspace.",
    capabilities: ["Section synthesis", "Markdown generation", "PDF rendering", "Artifact storage"],
    mcpServers: ["mcp-files"], runs24h: 22, successRate: 99.4, avgDurationS: 3.6, status: "IDLE",
  },
];

// ─────────────────────────── content pools ───────────────────────────

export const FINDINGS_POOL: Array<Omit<Finding, "id" | "agent">> = [
  { title: "Mistral AI leads the European frontier-model race", detail: "Paris-based Mistral has raised >€1.7B at a ~$14B valuation; Le Chat and the enterprise API are expanding across EU regulated industries.", source: "techcrunch.com", confidence: 0.96 },
  { title: "DeepL expands beyond translation into enterprise comms", detail: "Cologne's DeepL (€300M Series C, $2B valuation) launched DeepL Write and Voice; enterprise ARR is growing ~3× YoY.", source: "reuters.com", confidence: 0.93 },
  { title: "Synthesia scales AI-avatar video generation", detail: "London's Synthesia raised a $180M Series D at $2.1B; 50k+ enterprises use avatar video for training and compliance.", source: "ft.com", confidence: 0.91 },
  { title: "Wayve closes $1.05B for embodied driving AI", detail: "SoftBank-led round with Microsoft and NVIDIA participation; end-to-end learned driving deployed with Uber Eats in London.", source: "bloomberg.com", confidence: 0.94 },
  { title: "Aleph Alpha pivots to sovereign enterprise AI", detail: "Heidelberg's Aleph Alpha focuses on auditable, EU-hosted models for the public sector after €500M+ total funding.", source: "handelsblatt.com", confidence: 0.88 },
  { title: "PolyAI's voice agents cross 30M conversations", detail: "London-based, $53M Series C; voice assistants handle bookings and support for hospitality brands in 30+ languages.", source: "sifted.eu", confidence: 0.86 },
  { title: "Photoroom crosses $100M ARR", detail: "Paris photo-editing app hit $100M ARR within three years of launch; $43M Series C led by Salesforce Ventures.", source: "sifted.eu", confidence: 0.9 },
  { title: "H Company raises $220M for agentic tooling", detail: "Paris lab founded by ex-DeepMind researchers; building 'H', an agent platform focused on software engineering workflows.", source: "techcrunch.com", confidence: 0.85 },
];

export const JOBS_POOL = [
  { role: "Senior ML Engineer — LLM Inference", company: "Mistral AI", city: "Paris", salary: "€95–130k" },
  { role: "Machine Learning Engineer, Voice", company: "PolyAI", city: "London", salary: "£85–110k" },
  { role: "Research Engineer — Multimodal", company: "DeepL", city: "Cologne", salary: "€88–115k" },
  { role: "Backend Engineer, Rendering Pipeline", company: "Synthesia", city: "London", salary: "£80–105k" },
  { role: "Perception Engineer", company: "Wayve", city: "London", salary: "£90–125k" },
];

export const CLAIMS_POOL: Array<Omit<Claim, "id">> = [
  { claim: "Mistral AI's total funding exceeds €1.7B", sources: 3, confidence: 0.94, verified: true },
  { claim: "DeepL reached a $2B valuation at its Series C", sources: 2, confidence: 0.91, verified: true },
  { claim: "Synthesia's Series D was $200M", sources: 2, confidence: 0.62, verified: false, contradictions: "FT reports $180M; a press statement says $200M. Weighted majority supports $180M — claim adjusted." },
  { claim: "Wayve's round was led by SoftBank with NVIDIA participation", sources: 3, confidence: 0.95, verified: true },
  { claim: "Photoroom is profitable since 2024", sources: 1, confidence: 0.58, verified: false, contradictions: "Single source (founder interview); no independent confirmation found." },
];

export const THINKING: Record<AgentId, string[]> = {
  planner: [
    "Parsing objective into typed sub-goals…",
    "Matching required capabilities to registered agents…",
    "Estimating tool budget and ordering dependencies…",
  ],
  research: [
    "Expanding objective into {n} search queries…",
    "Reading top sources and extracting entities…",
    "Cross-checking figures across independent sources…",
  ],
  data: [
    "Generating SQL against warehouse schema…",
    "Computing aggregates and year-over-year deltas…",
    "Normalizing currencies and ranking results…",
  ],
  coding: [
    "Scanning repository tree for risk patterns…",
    "Triaging findings by severity and blast radius…",
    "Drafting issue body with reproduction context…",
  ],
  verification: [
    "Extracting verifiable claims from findings…",
    "Comparing each claim against collected sources…",
    "Scoring confidence and flagging contradictions…",
  ],
  report: [
    "Merging verified findings into report skeleton…",
    "Writing executive summary and methodology…",
    "Rendering final artifact and persisting…",
  ],
};

export const RECOVERY_NOTES = [
  "Switched to fallback tool after retry budget exhausted",
  "Primary endpoint timed out; fallback served cached extraction",
];

export function buildMarkdown(title: string, sections: ReportSection[]): string {
  const lines = [`# ${title}`, ""];
  for (const s of sections) {
    lines.push(`## ${s.heading}`, "");
    for (const b of s.body) lines.push(b.startsWith("- ") || b.startsWith("| ") || b.startsWith("> ") ? b : `${b}`, "");
  }
  return lines.join("\n");
}

// ─────────────────────────── seed generation ───────────────────────────

const PAST_TASKS = [
  { task: "Research the top 10 AI startups in Europe, compare funding, products and founders, and generate a report.", daysAgo: 1, ok: true, coding: false },
  { task: "Analyze Q4 churn drivers in the warehouse and summarize the top three cohorts by revenue impact.", daysAgo: 2, ok: true, coding: false },
  { task: "Audit public repos for exposed secrets and open tracking issues for anything critical.", daysAgo: 3, ok: true, coding: true },
  { task: "Compare vector database benchmarks (Qdrant, Milvus, Weaviate) and produce a decision brief.", daysAgo: 4, ok: true, coding: false },
  { task: "Map the MCP server ecosystem, extract capability matrices, and save a comparison CSV.", daysAgo: 6, ok: false, coding: false },
];

function ev(runId: string, ts: number, type: RunEvent["type"], message: string, agent?: AgentId, detail?: string): RunEvent {
  return { id: uid("ev"), ts, runId, type, agent, message, detail };
}

function toolCall(runId: string, agent: AgentId, server: string, tool: string, startedAt: number, r: () => number, opts?: Partial<ToolCall>): ToolCall {
  const durationMs = Math.round(between(r, 320, 1600));
  return {
    id: uid("tc"), runId, agent, server, tool,
    args: { query: `${tool} payload`, limit: 10 },
    result: { ok: true, items: Math.round(between(r, 3, 42)) },
    status: "SUCCESS", startedAt, durationMs, attempt: 1,
    tokens: Math.round(between(r, 260, 1400)), ...opts,
  };
}

function buildPastRun(spec: (typeof PAST_TASKS)[number], r: () => number): { run: Run; report?: Report } {
  const startedAt = now - spec.daysAgo * 86_400_000 - Math.round(between(r, 0, 6)) * 3_600_000;
  const id = uid("run");
  const plan: PlanStep[] = [
    { id: uid("st"), agent: "research", title: "Gather primary sources", description: "Search, fetch and extract the relevant public information.", tools: ["search_web", "fetch_url", "extract_content"], status: "COMPLETED", durationMs: Math.round(between(r, 8000, 14000)) },
    ...(spec.coding
      ? [{ id: uid("st"), agent: "coding" as AgentId, title: "Audit repositories", description: "Scan code and triage issues across target repos.", tools: ["search_repositories", "search_code", "get_issues"], status: "COMPLETED" as const, durationMs: Math.round(between(r, 6000, 10000)) }]
      : [{ id: uid("st"), agent: "data" as AgentId, title: "Structure & compute", description: "Query structured sources and compute comparisons.", tools: ["query_database"], status: "COMPLETED" as const, durationMs: Math.round(between(r, 3000, 6000)) }]),
    { id: uid("st"), agent: "verification", title: "Verify findings", description: "Cross-check claims against collected sources.", tools: ["search_web"], status: "COMPLETED", durationMs: Math.round(between(r, 3000, 5000)) },
    { id: uid("st"), agent: "report", title: "Generate report", description: "Synthesize a structured report and persist it.", tools: ["create_markdown", "create_pdf", "save_file"], status: spec.ok ? "COMPLETED" : "FAILED", durationMs: Math.round(between(r, 3000, 6000)) },
  ];

  const events: RunEvent[] = [];
  const toolCalls: ToolCall[] = [];
  let t = startedAt + 400;
  const push = (type: RunEvent["type"], message: string, agent?: AgentId) => { events.push(ev(id, t, type, message, agent)); t += Math.round(between(r, 700, 2600)); };

  push("task.started", "Objective received — spinning up orchestrator");
  push("plan.created", `Plan created · ${plan.length} steps across ${plan.length} agents`, "planner");
  for (const step of plan) {
    const serverFor = (tool: string) => tool.startsWith("search_web") || tool.includes("url") || tool.includes("content") ? "mcp-web" : tool.includes("database") ? "mcp-postgres" : tool.includes("repositor") || tool.includes("code") || tool.includes("issue") ? "mcp-github" : "mcp-files";
    push("agent.started", `${step.agent === "research" ? "Research Agent" : step.agent === "data" ? "Data Agent" : step.agent === "coding" ? "Coding Agent" : step.agent === "verification" ? "Verification Agent" : "Report Agent"} started — ${step.title}`, step.agent);
    for (const tool of step.tools) toolCalls.push(toolCall(id, step.agent, serverFor(tool), tool, t, r));
    t += Math.round(between(r, 1500, 3200));
    if (step.status === "FAILED") {
      push("tool.failed", "create_pdf failed — rendering service unavailable", step.agent);
      push("task.failed", "Report rendering failed after retries; run terminated gracefully", step.agent);
    } else {
      push("agent.completed", `${step.title} — completed`, step.agent);
    }
  }
  if (spec.ok) push("task.completed", "Run completed — report persisted to workspace");

  const findings = FINDINGS_POOL.slice(0, spec.coding ? 2 : 3).map((f) => ({ ...f, id: uid("fd"), agent: (spec.coding ? "coding" : "research") as AgentId }));
  const claims = CLAIMS_POOL.slice(0, 3).map((c) => ({ ...c, id: uid("cl") }));
  const tokens = Math.round(between(r, 60_000, 140_000));
  const endedAt = t + 800;
  const title = spec.task.split(",")[0].replace(/^(Research|Analyze|Audit|Compare|Map)\s/i, "$1: ");

  const report: Report | undefined = spec.ok
    ? {
        id: uid("rep"), runId: id, title, createdAt: endedAt, format: "PDF",
        pages: Math.round(between(r, 6, 14)), tokens: Math.round(between(r, 8000, 15000)),
        tags: ["demo-seed", spec.coding ? "security" : "research"],
        sections: [
          { heading: "Executive Summary", body: [`This report consolidates ${findings.length} primary findings collected by ${plan.length} specialized agents.`, `Overall verification confidence: ${(claims.reduce((a, c) => a + c.confidence, 0) / claims.length).toFixed(2)}.`] },
          { heading: "Methodology", body: ["- Multi-agent pipeline orchestrated by LangGraph (plan → route → execute → verify → report).", `- Tool execution via MCP registry (${toolCalls.length} calls).`, "- Claims cross-checked by the Verification Agent before inclusion."] },
          { heading: "Findings", body: findings.map((f) => `- **${f.title}** — ${f.detail} (${f.source})`) },
          { heading: "Verified Claims", body: claims.map((c) => `- ${c.claim} — confidence ${c.confidence.toFixed(2)} · ${c.verified ? "verified" : "unverified"}`) },
          { heading: "Conclusion", body: ["Evidence is consistent across independent sources; flagged contradictions are noted inline.", "Full artifact stored in workspace `/reports`."] },
        ],
        markdown: "",
      }
    : undefined;
  if (report) report.markdown = buildMarkdown(report.title, report.sections);

  const run: Run = {
    id, task: spec.task, status: spec.ok ? "COMPLETED" : "FAILED",
    createdAt: startedAt, startedAt, endedAt: spec.ok ? endedAt : undefined,
    progress: spec.ok ? 100 : 72, activeAgent: undefined,
    plan, events, toolCalls, findings: spec.ok ? findings : [], claims: spec.ok ? claims : [],
    approvals: [], recoveries: spec.ok ? [] : [{ id: uid("rc"), tool: "create_pdf", server: "mcp-files", failures: ["render timeout", "render timeout"], resolution: "No fallback available — terminated gracefully", recoveredAt: t }],
    nodeStates: {
      planner: "SUCCESS", router: "SUCCESS",
      research: spec.coding ? "SUCCESS" : "SUCCESS",
      data: spec.coding ? undefined : spec.ok ? "SUCCESS" : "FAILED",
      coding: spec.coding ? (spec.ok ? "SUCCESS" : "FAILED") : undefined,
      verification: spec.ok ? "SUCCESS" : "WAITING",
      report: spec.ok ? "SUCCESS" : "FAILED",
    },
    mcpCalls: toolCalls.length, tokens, cost: (tokens / 1e6) * 3.2,
    options: defaultOptions(),
    reportId: report?.id,
    summary: spec.ok ? `${findings.length} findings verified across ${toolCalls.length} MCP calls.` : "Terminated: PDF rendering service unavailable after retry budget exhausted.",
  };
  return { run, report };
}

export const defaultOptions = (): TaskOptions => ({
  provider: "Groq", model: "llama-3.3-70b", maxDurationS: 300, maxToolCalls: 40,
  webResearch: true, useMemory: true, requireApproval: true, verify: true, outputFormat: "PDF",
});

/** A live run, mid-flight, that the engine will continue after boot — demonstrating checkpoint resume. */
function buildAtlasRun(): Run {
  const id = "run-atlas";
  const startedAt = now - 96_000;
  const plan: PlanStep[] = [
    { id: "st-a1", agent: "research", title: "Map public repositories", description: "Discover the organization's public repos and surface security-relevant issues.", tools: ["search_repositories", "get_repository"], status: "COMPLETED", durationMs: 8400 },
    { id: "st-a2", agent: "coding", title: "Scan code & open tracking issues", description: "Run code search for secret-exposure patterns; open a tracking issue for critical hits.", tools: ["search_code", "create_issue"], status: "RUNNING" },
    { id: "st-a3", agent: "verification", title: "Verify findings", description: "Confirm the flagged pattern is a true positive across refs.", tools: ["search_web"], status: "PENDING" },
    { id: "st-a4", agent: "report", title: "Generate audit report", description: "Produce the security audit report and persist artifacts.", tools: ["create_markdown", "create_pdf", "save_file"], status: "PENDING" },
  ];
  const events: RunEvent[] = [];
  const toolCalls: ToolCall[] = [];
  const r = rng(99);
  let t = startedAt + 300;
  const push = (type: RunEvent["type"], message: string, agent?: AgentId) => { events.push(ev(id, t, type, message, agent)); t += Math.round(between(r, 600, 1800)); };
  push("task.started", "Objective received — spinning up orchestrator");
  push("plan.created", "Plan created · 4 steps · resume checkpoint enabled", "planner");
  push("agent.started", "Research Agent started — Map public repositories", "research");
  toolCalls.push(toolCall(id, "research", "mcp-github", "search_repositories", t, r, { args: { q: "org:acme-labs", sort: "updated" }, result: { total: 14, items: 14 } }));
  t += 1400;
  toolCalls.push(toolCall(id, "research", "mcp-github", "get_repository", t, r, { args: { repo: "acme-labs/billing-api" }, result: { stars: 214, openIssues: 7 } }));
  t += 1200;
  push("agent.completed", "Map public repositories — 14 repos found, 3 security-relevant", "research");
  push("agent.started", "Coding Agent started — Scan code & open tracking issues", "coding");
  push("agent.thinking", "Scanning repository tree for risk patterns…", "coding");
  toolCalls.push(toolCall(id, "coding", "mcp-github", "search_code", t, r, { args: { q: "AKIA repo:acme-labs/billing-api" }, result: { hits: 2, files: ["src/config/env.ts", "scripts/deploy.sh"] } }));
  t += 1600;
  push("agent.thinking", "Triaging findings by severity and blast radius…", "coding");

  return {
    id, task: "Audit our public GitHub repositories for exposed credentials and open tracking issues for critical findings.",
    status: "RUNNING", createdAt: startedAt, startedAt, progress: 42, activeAgent: "coding",
    plan, events, toolCalls, findings: [], claims: [], approvals: [], recoveries: [],
    nodeStates: { planner: "SUCCESS", router: "SUCCESS", research: "SUCCESS", coding: "RUNNING", verification: "WAITING", report: "WAITING" },
    mcpCalls: 3, tokens: 21_400, cost: 0.07,
    options: { ...defaultOptions(), requireApproval: true },
  };
}

export const MEMORIES_SEED: MemoryItem[] = [
  { id: uid("mem"), type: "finding", title: "European AI funding concentrated in Paris & London", snippet: "Across 3 research runs, 68% of tracked European AI capital (2023–25) went to Paris and London-based companies.", tags: ["europe", "funding", "startups"], createdAt: now - 86_400_000, source: "run: top-10-eu-ai" },
  { id: uid("mem"), type: "report", title: "Vector DB decision brief (Qdrant selected)", snippet: "Qdrant outperformed on p99 recall latency at 1M vectors; Milvus led on raw throughput. Decision: Qdrant for semantic memory.", tags: ["qdrant", "infrastructure"], createdAt: now - 3 * 86_400_000, source: "run: vector-db-compare" },
  { id: uid("mem"), type: "knowledge", title: "User prefers approval gates on all GitHub writes", snippet: "Preference learned: never execute create_issue or PR mutations without explicit human approval.", tags: ["preferences", "github", "hitl"], createdAt: now - 5 * 86_400_000 },
  { id: uid("mem"), type: "finding", title: "Mistral AI valuation trajectory", snippet: "Tracked across runs: €580M (2023) → €2B (2024) → ~$14B (latest round). Consistent across 3 independent sources.", tags: ["mistral", "valuation"], createdAt: now - 2 * 86_400_000, source: "run: top-10-eu-ai" },
  { id: uid("mem"), type: "knowledge", title: "Churn model: onboarding week is decisive", snippet: "Warehouse analysis: accounts with <3 active seats in week 1 churn at 4.1× the base rate.", tags: ["churn", "product"], createdAt: now - 4 * 86_400_000, source: "run: q4-churn" },
  { id: uid("mem"), type: "report", title: "MCP ecosystem capability matrix", snippet: "18 public MCP servers catalogued; web, git and database categories cover 82% of observed agent tool demand.", tags: ["mcp", "ecosystem"], createdAt: now - 6 * 86_400_000, source: "run: mcp-ecosystem" },
  { id: uid("mem"), type: "finding", title: "DeepL enterprise expansion pattern", snippet: "DeepL's enterprise ARR growth correlates with Voice launch; 30% of new logos cite compliance (EU hosting) as driver.", tags: ["deepl", "enterprise"], createdAt: now - 7 * 86_400_000 },
  { id: uid("mem"), type: "preference", title: "Reports: always include methodology section", snippet: "User-approved template preference: executive summary → methodology → findings → sources → confidence → conclusion.", tags: ["reports", "template"], createdAt: now - 9 * 86_400_000 },
];

export function genDayStats(): DayStat[] {
  const r = rng(7);
  const out: DayStat[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now - i * 86_400_000);
    const tasks = Math.round(between(r, 2, 11)) + (i < 7 ? 2 : 0);
    const failed = Math.round(between(r, 0, tasks * 0.18));
    const tokens = Math.round(between(r, 180_000, 900_000));
    out.push({
      label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      tasks, success: tasks - failed, failed, tokens,
      cost: (tokens / 1e6) * 3.2, avgS: between(r, 14, 42), mcp: Math.round(between(r, 24, 130)),
    });
  }
  return out;
}

export function buildSeedState(): Pick<AppState, "runs" | "servers" | "agents" | "memories" | "reports" | "approvals" | "notifs" | "dayStats" | "totals"> {
  const reports: Report[] = [];
  const runs: Run[] = [];
  for (const spec of PAST_TASKS) {
    const { run, report } = buildPastRun(spec, rng(spec.daysAgo * 13 + 5));
    runs.push(run);
    if (report) reports.push(report);
  }
  const atlas = buildAtlasRun();
  const pastApprovals: Approval[] = [
    {
      id: uid("ap"), runId: runs[2].id, agent: "coding", action: "Create GitHub Issue", tool: "create_issue", server: "mcp-github",
      description: "Hard-coded staging API key found in scripts/deploy.sh. Proposing a tracking issue with rotation checklist.",
      summary: { Repository: "acme-labs/deploy-tools", Title: "Rotate exposed staging API key", Severity: "HIGH" },
      risk: "HIGH", status: "APPROVED", createdAt: now - 3 * 86_400_000, decidedAt: now - 3 * 86_400_000 + 240_000,
    },
    {
      id: uid("ap"), runId: runs[1].id, agent: "data", action: "Update warehouse record", tool: "update_record", server: "mcp-postgres",
      description: "Backfill corrected churn labels for 2024-Q3 cohort (142 rows).",
      summary: { Table: "analytics.churn_labels", Rows: "142", Filter: "cohort = '2024-Q3'" },
      risk: "MEDIUM", status: "REJECTED", createdAt: now - 2 * 86_400_000, decidedAt: now - 2 * 86_400_000 + 610_000,
    },
  ];
  const notifs: Notif[] = [
    { id: uid("nt"), ts: now - 3 * 3_600_000, kind: "success", title: "Report ready — Vector DB decision brief", detail: "12 pages · confidence 0.93", read: true, runId: runs[3].id },
    { id: uid("nt"), ts: now - 5 * 3_600_000, kind: "warn", title: "Run failed — MCP ecosystem map", detail: "create_pdf unavailable after retries", read: false, runId: runs[4].id },
    { id: uid("nt"), ts: now - 26 * 3_600_000, kind: "info", title: "MCP registry refreshed", detail: "4 servers · 18 tools discovered", read: true },
  ];
  return {
    runs: [atlas, ...runs],
    servers: SERVERS_SEED,
    agents: AGENTS_SEED,
    memories: MEMORIES_SEED,
    reports,
    approvals: pastApprovals,
    notifs,
    dayStats: genDayStats(),
    totals: { tasks: 147, success: 139, mcpCalls: 1824, tokens: 12_430_000, cost: 41.86 },
  };
}

