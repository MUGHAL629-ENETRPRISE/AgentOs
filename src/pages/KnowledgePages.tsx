import { useState } from "react";
import { BookOpen, FileText, KeyRound, Lightbulb, Radar, Search, Settings2 } from "lucide-react";
import type { MemoryItem, Report } from "../lib/types";
import { memorySearch, navigate, useApp } from "../lib/store";
import { cx, fmtNum, timeAgo } from "../lib/util";
import { EmptyState, Modal, StatusBadge } from "../components/ui";
import { PageHead } from "../components/chrome";
import { ReportView } from "../components/runbits";

// ─────────────────────────── memory (RAG) ───────────────────────────

const MEM_ICON = { finding: <Radar size={13} />, report: <FileText size={13} />, knowledge: <Lightbulb size={13} />, preference: <Settings2 size={13} /> } as const;
const MEM_TONE = { finding: "text-run border-run/30 bg-run/[0.07]", report: "text-brand border-brand/30 bg-brand/[0.07]", knowledge: "text-warn border-warn/30 bg-warn/[0.07]", preference: "text-data border-data/30 bg-data/[0.07]" } as const;

export function MemoryPage() {
  const s = useApp();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<MemoryItem[] | null>(null);
  const [searching, setSearching] = useState(false);

  const search = async () => {
    setSearching(true);
    const r = await memorySearch(q.trim());
    setResults(r);
    setSearching(false);
  };

  const shown = results ?? s.memories.map((m) => ({ ...m, score: undefined }));

  return (
    <div className="animate-fade-up">
      <PageHead title="Semantic Memory" sub="Long-term knowledge persisted in Qdrant. Agents recall relevant memories before researching, so previous runs compound instead of repeating." />

      <div className="card mb-4 p-4">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-0 flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dim" />
            <input
              value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
              placeholder='Try: "What did we discover about European AI startups in previous tasks?"'
              className="w-full rounded-lg border border-edge bg-ink-900 py-2.5 pl-9 pr-3 text-[12.5px] text-hi placeholder:text-dim focus:border-brand/50 focus:outline-none focus:ring-2 focus:ring-brand/15"
            />
          </div>
          <button onClick={search} className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-[12.5px] font-bold text-ink-950 transition-all hover:brightness-110 active:scale-[0.97]">
            <Search size={13} /> Recall
          </button>
        </div>
        <p className="mt-2 flex items-center gap-1.5 font-mono text-[10px] text-dim">
          <KeyRound size={10} /> retrieval: cosine similarity over 768-dim embeddings · collection <span className="text-brand">agentos_memories</span>
        </p>
      </div>

      {searching && (
        <div className="grid gap-3 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-28" />)}
        </div>
      )}

      {!searching && shown.length === 0 && (
        <EmptyState icon={<BookOpen size={22} />} title="No matching memories" hint="Try a broader query — retrieval is keyword-scored in demo mode and vector-based against Qdrant in production." />
      )}

      {!searching && shown.length > 0 && (
        <>
          {results && <p className="mb-3 font-mono text-[10.5px] text-mid">{results.length} memories retrieved · query time 0.19s</p>}
          <div className="grid gap-3 md:grid-cols-2">
            {shown.map((m) => (
              <div key={m.id} className="card card-hover p-4">
                <div className="flex items-start justify-between gap-3">
                  <span className={cx("flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[9.5px] capitalize", MEM_TONE[m.type])}>
                    {MEM_ICON[m.type]} {m.type}
                  </span>
                  {m.score !== undefined && (
                    <span className="flex items-center gap-1.5 font-mono text-[10px] text-ok">
                      <span className="h-1 w-12 overflow-hidden rounded-full bg-ink-700"><span className="block h-full rounded-full bg-ok" style={{ width: `${(m.score as number) * 100}%` }} /></span>
                      {(m.score as number).toFixed(2)}
                    </span>
                  )}
                </div>
                <h3 className="mt-2.5 text-[13px] font-semibold leading-snug text-hi">{m.title}</h3>
                <p className="mt-1 text-[11.5px] leading-relaxed text-mid">{m.snippet}</p>
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  {m.tags.map((t) => <span key={t} className="rounded border border-edge bg-ink-800/70 px-1.5 py-px font-mono text-[9px] text-dim">#{t}</span>)}
                  <span className="ml-auto font-mono text-[9.5px] text-dim">{timeAgo(m.createdAt)}{m.source ? ` · ${m.source}` : ""}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────── reports ───────────────────────────

export function ReportsPage() {
  const s = useApp();
  const [openId, setOpenId] = useState<string | null>(null);
  const report = s.reports.find((r) => r.id === openId);

  return (
    <div className="animate-fade-up">
      <PageHead title="Report Library" sub="Every completed run synthesizes a structured artifact — executive summary, methodology, findings, sources and confidence." />
      {s.reports.length === 0
        ? <EmptyState icon={<FileText size={22} />} title="No reports yet" hint="Complete a run and the Report Agent will persist its artifact here." />
        : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {s.reports.map((r) => <ReportCard key={r.id} r={r} onOpen={() => setOpenId(r.id)} />)}
          </div>
        )}
      <Modal open={Boolean(report)} onClose={() => setOpenId(null)} wide title={report?.title ?? ""}>
        {report && <ReportView report={report} />}
      </Modal>
    </div>
  );
}

function ReportCard({ r, onOpen }: { r: Report; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="card card-hover flex flex-col p-4 text-left">
      <div className="flex items-center justify-between gap-2">
        <StatusBadge status={r.format === "PDF" ? "SUCCESS" : "COMPLETED"} className="!text-brand" />
        <span className="rounded-md border border-brand/30 bg-brand/10 px-1.5 py-0.5 font-mono text-[9.5px] font-semibold text-brand">{r.format}</span>
      </div>
      <h3 className="mt-2.5 line-clamp-2 flex-1 text-[13px] font-semibold leading-snug text-hi">{r.title}</h3>
      <p className="mt-2 font-mono text-[10px] text-dim">{r.pages} pages · {fmtNum(r.tokens)} tokens · {timeAgo(r.createdAt)}</p>
      <div className="mt-2 flex flex-wrap gap-1">
        {r.tags.map((t) => <span key={t} className="rounded border border-edge bg-ink-800/70 px-1.5 py-px font-mono text-[9px] text-dim">#{t}</span>)}
      </div>
      <span className="mt-3 flex items-center justify-between border-t border-edge pt-2.5 text-[11px] font-semibold text-brand">
        Open report <span aria-hidden>→</span>
      </span>
      <span className="sr-only">run {r.runId}</span>
      <RunLink runId={r.runId} />
    </button>
  );
}

function RunLink({ runId }: { runId: string }) {
  return (
    <span
      role="link" tabIndex={0}
      onClick={(e) => { e.stopPropagation(); navigate("run", runId); }}
      onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); navigate("run", runId); } }}
      className="mt-1 inline-block text-[10.5px] font-medium text-dim hover:text-run hover:underline"
    >
      view source run
    </span>
  );
}
