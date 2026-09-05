// ─────────────────────────────────────────────────────────────
// AgentOS — core domain types
// Mirrors the Pydantic schemas of the FastAPI backend contract.
// ─────────────────────────────────────────────────────────────

export type Page =
  | "dashboard" | "new" | "runs" | "run" | "workflows" | "agents"
  | "mcp" | "tools" | "memory" | "approvals" | "reports" | "analytics" | "settings";

export interface RouteState { page: Page; runId?: string }

export type RunStatus = "QUEUED" | "RUNNING" | "AWAITING_APPROVAL" | "COMPLETED" | "FAILED" | "CANCELLED";
export type NodeState = "WAITING" | "RUNNING" | "SUCCESS" | "FAILED" | "PAUSED" | "SKIPPED";
export type AgentId = "planner" | "research" | "data" | "coding" | "verification" | "report";
export type GraphNodeId = AgentId | "router" | "approval";
export type StepStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "SKIPPED";
export type ToolStatus = "RUNNING" | "SUCCESS" | "FAILED" | "REJECTED";

export type EventType =
  | "task.started" | "plan.created" | "step.completed"
  | "agent.started" | "agent.thinking" | "agent.completed"
  | "tool.started" | "tool.completed" | "tool.failed" | "tool.retry"
  | "approval.required" | "approval.granted" | "approval.rejected"
  | "verification.completed" | "run.recovered"
  | "task.completed" | "task.failed" | "task.cancelled";

export interface RunEvent {
  id: string; ts: number; runId: string; type: EventType;
  agent?: AgentId; message: string; detail?: string;
}

export interface ToolCall {
  id: string; runId: string; agent: AgentId; server: string; tool: string;
  args: Record<string, unknown>; result?: unknown; status: ToolStatus;
  startedAt: number; durationMs: number; attempt: number; error?: string; tokens: number;
}

export interface PlanStep {
  id: string; agent: AgentId; title: string; description: string;
  tools: string[]; status: StepStatus; durationMs?: number;
}

export interface Finding {
  id: string; title: string; detail: string; source: string;
  confidence: number; agent: AgentId;
}

export interface Claim {
  id: string; claim: string; sources: number; confidence: number;
  verified: boolean; contradictions?: string;
}

export interface Approval {
  id: string; runId: string; agent: AgentId; action: string; tool: string; server: string;
  description: string; summary: Record<string, string>; risk: "HIGH" | "MEDIUM";
  status: "PENDING" | "APPROVED" | "REJECTED"; createdAt: number; decidedAt?: number;
}

export interface RecoveryEntry {
  id: string; tool: string; server: string; failures: string[];
  fallbackTool?: string; resolution: string; recoveredAt: number;
}

export interface ReportSection { heading: string; body: string[] }

export interface Report {
  id: string; runId: string; title: string; createdAt: number;
  format: "PDF" | "MD"; pages: number; tokens: number;
  sections: ReportSection[]; markdown: string; tags: string[];
}

export interface MemoryItem {
  id: string; type: "finding" | "report" | "knowledge" | "preference";
  title: string; snippet: string; tags: string[]; createdAt: number;
  source?: string; score?: number;
}

export interface TaskOptions {
  provider: string; model: string; maxDurationS: number; maxToolCalls: number;
  webResearch: boolean; useMemory: boolean; requireApproval: boolean;
  verify: boolean; outputFormat: "PDF" | "MD" | "JSON";
}

export interface Run {
  id: string; task: string; status: RunStatus;
  createdAt: number; startedAt: number; endedAt?: number;
  progress: number; activeAgent?: AgentId;
  plan: PlanStep[]; events: RunEvent[]; toolCalls: ToolCall[];
  findings: Finding[]; claims: Claim[]; approvals: Approval[];
  recoveries: RecoveryEntry[]; nodeStates: Partial<Record<GraphNodeId, NodeState>>;
  mcpCalls: number; tokens: number; cost: number;
  options: TaskOptions; reportId?: string; summary?: string;
}

export interface MCPTool {
  name: string; description: string; category: "read" | "write";
  calls24h: number; avgMs: number; requiresApproval?: boolean;
}

export interface MCPServer {
  id: string; name: string; description: string; endpoint: string;
  status: "CONNECTED" | "DEGRADED" | "OFFLINE";
  tools: MCPTool[]; latencyMs: number; lastSeen: number;
  calls24h: number; errors24h: number; version: string;
}

export interface AgentDef {
  id: AgentId; name: string; role: string; description: string;
  capabilities: string[]; mcpServers: string[]; model: string;
  runs24h: number; successRate: number; avgDurationS: number;
  status: "IDLE" | "ACTIVE";
}

export interface Toast { id: string; kind: "info" | "success" | "error" | "warn"; title: string; detail?: string }

export interface Notif {
  id: string; ts: number; kind: "info" | "success" | "warn" | "error";
  title: string; detail?: string; read: boolean; runId?: string;
}

export interface DayStat {
  label: string; tasks: number; success: number; failed: number;
  tokens: number; cost: number; avgS: number; mcp: number;
}

export interface Settings {
  provider: string; model: string; temperature: number; maxTokens: number;
  apiKey: string; webResearch: boolean; useMemory: boolean;
  requireApproval: boolean; telemetry: boolean;
}

export interface Totals { tasks: number; success: number; mcpCalls: number; tokens: number; cost: number }

export interface AppState {
  booted: boolean; bootStep: number;
  route: RouteState;
  runs: Run[]; feed: RunEvent[];
  servers: MCPServer[]; agents: AgentDef[];
  memories: MemoryItem[]; reports: Report[];
  approvals: Approval[]; toasts: Toast[]; notifs: Notif[];
  dayStats: DayStat[]; totals: Totals; settings: Settings;
  pendingPlan: { task: string; options: TaskOptions; plan: PlanStep[]; thinking: string[] } | null;
  openApprovalId: string | null;
}
