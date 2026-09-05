import { useEffect, useState } from "react";
import { boot, useApp } from "./lib/store";
import { ApprovalGate, BootOverlay, Sidebar, ToastHost, TopBar } from "./components/chrome";
import { Dashboard } from "./pages/Dashboard";
import { NewTask } from "./pages/NewTask";
import { RunsPage } from "./pages/RunsPage";
import { RunDetails } from "./pages/RunDetails";
import { AgentsPage, MCPPage, ToolCallsPage } from "./pages/OpsPages";
import { MemoryPage, ReportsPage } from "./pages/KnowledgePages";
import { Analytics } from "./pages/Analytics";
import { ApprovalsPage, SettingsPage, WorkflowsPage } from "./pages/SystemPages";

export default function App() {
  const s = useApp();
  const [mobileNav, setMobileNav] = useState(false);

  useEffect(() => { boot(); }, []);

  const page = s.route.page;

  return (
    <div className="relative h-full overflow-hidden">
      {/* ambient layered background */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="bg-grid absolute inset-0" />
        <div className="glow animate-drift-a left-[-10%] top-[-18%] h-[520px] w-[640px] bg-brand/[0.05]" />
        <div className="glow animate-drift-b right-[-12%] top-[12%] h-[460px] w-[560px] bg-data/[0.05]" />
        <div className="glow animate-drift-a bottom-[-22%] left-[22%] h-[420px] w-[520px] bg-warn/[0.035]" />
      </div>

      <Sidebar mobileOpen={mobileNav} onClose={() => setMobileNav(false)} />

      <div className="relative z-10 flex h-full flex-col lg:pl-[218px]">
        <TopBar onMenu={() => setMobileNav(true)} />
        <main className="flex-1 overflow-y-auto px-4 py-5 md:px-6">
          <div className="mx-auto max-w-[1280px] pb-10" key={`${page}-${s.route.runId ?? ""}`}>
            {page === "dashboard" && <Dashboard />}
            {page === "new" && <NewTask />}
            {page === "runs" && <RunsPage />}
            {page === "run" && <RunDetails />}
            {page === "workflows" && <WorkflowsPage />}
            {page === "agents" && <AgentsPage />}
            {page === "mcp" && <MCPPage />}
            {page === "tools" && <ToolCallsPage />}
            {page === "memory" && <MemoryPage />}
            {page === "approvals" && <ApprovalsPage />}
            {page === "reports" && <ReportsPage />}
            {page === "analytics" && <Analytics />}
            {page === "settings" && <SettingsPage />}
          </div>
        </main>
      </div>

      <ToastHost />
      <ApprovalGate />
      <BootOverlay />
    </div>
  );
}
