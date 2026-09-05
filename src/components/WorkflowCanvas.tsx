import { useMemo } from "react";
import ReactFlow, {
  Background, BackgroundVariant, Controls, Edge, Handle, Node, NodeProps, Position,
} from "reactflow";
import "reactflow/dist/style.css";
import { Bot, Compass, Database, FileText, GitBranch, Radar, ShieldAlert, ShieldCheck, TerminalSquare } from "lucide-react";
import type { GraphNodeId, NodeState, Run } from "../lib/types";
import { cx, fmtDur } from "../lib/util";
import { StatusBadge } from "./ui";

export interface NodeData {
  label: string; icon: React.ReactNode; state: NodeState;
  tools: number; duration?: number; sub?: string;
  onSelect: (id: GraphNodeId) => void; selected: boolean; id: GraphNodeId;
}

const NODE_META: Record<GraphNodeId, { label: string; icon: React.ReactNode }> = {
  planner: { label: "Planner", icon: <Compass size={14} /> },
  router: { label: "Task Router", icon: <GitBranch size={14} /> },
  research: { label: "Research Agent", icon: <Radar size={14} /> },
  data: { label: "Data Agent", icon: <Database size={14} /> },
  coding: { label: "Coding Agent", icon: <TerminalSquare size={14} /> },
  verification: { label: "Verification", icon: <ShieldCheck size={14} /> },
  approval: { label: "Human Approval", icon: <ShieldAlert size={14} /> },
  report: { label: "Report Generator", icon: <FileText size={14} /> },
};

const POS: Record<GraphNodeId, { x: number; y: number }> = {
  planner: { x: 292, y: 0 }, router: { x: 292, y: 108 },
  research: { x: 34, y: 224 }, data: { x: 292, y: 224 }, coding: { x: 550, y: 224 },
  verification: { x: 292, y: 348 }, approval: { x: 566, y: 372 }, report: { x: 292, y: 468 },
};

const STATE_GLOW: Record<string, string> = {
  RUNNING: "0 0 0 1px rgba(56,189,248,.55), 0 0 22px rgba(56,189,248,.18)",
  SUCCESS: "0 0 0 1px rgba(52,211,153,.25)",
  FAILED: "0 0 0 1px rgba(251,113,133,.5), 0 0 22px rgba(251,113,133,.15)",
  PAUSED: "0 0 0 1px rgba(251,191,36,.55), 0 0 22px rgba(251,191,36,.14)",
};

function AgentNode({ data }: NodeProps<NodeData>) {
  const running = data.state === "RUNNING";
  return (
    <div className={cx("wf-node", data.selected && "sel")} onClick={() => data.onSelect(data.id)}
      style={{ boxShadow: STATE_GLOW[data.state] }}>
      <Handle type="target" position={Position.Top} />
      <div className="flex items-center gap-2">
        <span className={cx("shrink-0", running ? "text-run" : data.state === "SUCCESS" ? "text-ok" : data.state === "FAILED" ? "text-bad" : data.state === "PAUSED" ? "text-warn" : "text-dim")}>
          {data.icon}
        </span>
        <span className="truncate text-[12px] font-semibold text-hi">{data.label}</span>
        {running && <span className="ml-auto h-3 w-3 shrink-0 animate-spin rounded-full border border-run border-t-transparent" />}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <StatusBadge status={data.state} />
        <span className="font-mono text-[9.5px] text-dim">
          {data.tools > 0 ? `${data.tools} tool${data.tools > 1 ? "s" : ""}` : data.sub ?? "—"}
          {data.duration ? ` · ${fmtDur(data.duration)}` : ""}
        </span>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const nodeTypes = { agent: AgentNode };

interface CanvasProps {
  run?: Run;
  staticMode?: boolean;
  selected?: GraphNodeId | null;
  onSelect?: (id: GraphNodeId) => void;
}

export function WorkflowCanvas({ run, staticMode, selected, onSelect }: CanvasProps) {
  const { nodes, edges } = useMemo(() => {
    const stateOf = (id: GraphNodeId): NodeState => {
      if (staticMode) {
        return ({ planner: "SUCCESS", router: "SUCCESS", research: "RUNNING", data: "WAITING", coding: "WAITING", verification: "WAITING", approval: "PAUSED", report: "WAITING" } as Record<GraphNodeId, NodeState>)[id];
      }
      return run?.nodeStates[id] ?? "WAITING";
    };
    const toolsOf = (id: GraphNodeId) => run?.toolCalls.filter((t) => t.agent === id).length ?? 0;
    const durOf = (id: GraphNodeId) => run?.plan.find((p) => p.agent === id)?.durationMs;

    const usedAgents: GraphNodeId[] = staticMode
      ? ["research", "data", "coding"]
      : Array.from(new Set((run?.plan ?? []).map((p) => p.agent))) as GraphNodeId[];
    const ids: GraphNodeId[] = ["planner", "router", ...(["research", "data", "coding"] as GraphNodeId[]), "verification", "approval", "report"];

    const nodes: Node<NodeData>[] = ids.map((id) => ({
      id, type: "agent", position: POS[id], draggable: true, selectable: false,
      data: {
        ...NODE_META[id], id, state: stateOf(id), tools: toolsOf(id), duration: durOf(id),
        sub: id === "approval" ? "gate" : id === "router" ? "conditional" : undefined,
        onSelect: onSelect ?? (() => {}), selected: selected === id,
      },
    }));

    const edgeStyle = (from: GraphNodeId, dim?: boolean): Partial<Edge> => {
      const st = stateOf(from);
      if (dim) return { style: { stroke: "#1b2839", strokeWidth: 1.2 }, animated: false };
      if (st === "RUNNING") return { className: "animated", style: { stroke: "#38bdf8", strokeWidth: 1.8 } };
      if (st === "SUCCESS") return { style: { stroke: "#2dd4bf", strokeWidth: 1.6, opacity: 0.75 } };
      if (st === "FAILED") return { style: { stroke: "#fb7185", strokeWidth: 1.6 } };
      if (st === "PAUSED") return { style: { stroke: "#fbbf24", strokeWidth: 1.6 }, animated: true };
      return { style: { stroke: "#25384e", strokeWidth: 1.2, strokeDasharray: "4 5" } };
    };

    const edges: Edge[] = [
      { id: "e-plan-route", source: "planner", target: "router", ...edgeStyle("planner") },
      ...(["research", "data", "coding"] as GraphNodeId[]).map((a) => ({
        id: `e-route-${a}`, source: "router", target: a,
        ...edgeStyle("router", !staticMode && !usedAgents.includes(a)),
      })),
      ...(staticMode ? (["research", "data", "coding"] as GraphNodeId[]) : usedAgents.filter((a) => a !== "verification" && a !== "report")).map((a) => ({
        id: `e-${a}-verif`, source: a, target: "verification" as string, ...edgeStyle(a),
      })),
      { id: "e-verif-report", source: "verification", target: "report", ...edgeStyle("verification") },
      {
        id: "e-verif-approval", source: "verification", target: "approval",
        label: "sensitive op", labelStyle: { fill: "#5c7189", fontSize: 9, fontFamily: "JetBrains Mono" },
        style: { stroke: "#fbbf24", strokeWidth: 1.2, strokeDasharray: "5 5", opacity: stateOf("approval") === "WAITING" && !staticMode ? 0.35 : 0.8 },
        animated: stateOf("approval") === "PAUSED",
      },
    ];
    return { nodes, edges };
  }, [run, staticMode, selected, onSelect]);

  return (
    <ReactFlow
      nodes={nodes} edges={edges} nodeTypes={nodeTypes}
      fitView fitViewOptions={{ padding: 0.18 }} minZoom={0.5} maxZoom={1.4}
      proOptions={{ hideAttribution: false }} nodesConnectable={false} elementsSelectable={false}
    >
      <Background variant={BackgroundVariant.Dots} gap={26} size={1} color="#1b2839" />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}

export function StateLegend() {
  const states: NodeState[] = ["WAITING", "RUNNING", "SUCCESS", "FAILED", "PAUSED"];
  return (
    <div className="flex flex-wrap items-center gap-2">
      {states.map((s) => <StatusBadge key={s} status={s} />)}
      <span className="ml-1 flex items-center gap-1.5 font-mono text-[10px] text-dim"><Bot size={11} /> click a node for details</span>
    </div>
  );
}
