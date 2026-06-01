import {
  CheckCircle2,
  Loader2,
  Play,
  ScrollText,
} from "lucide-react";
import { CrossRunAiUsagePanel } from "./CrossRunAiUsagePanel.jsx";
import { ErrorNotice, RunResult } from "./RunResult.jsx";
import { requireRunEvents } from "./runEvidenceState.js";
import { buildRunResultActions } from "./runResultActions.js";

const STAGES = [
  { id: "clarify", eventStage: "clarifying" },
  { id: "plan", eventStage: "planning" },
  { id: "edit", eventStage: "editing" },
  { id: "verify", eventStage: "verifying" },
  { id: "pr", eventStage: "pr_drafting" },
];

export function ConsoleLayout({ actions, consoleState }) {
  const { loading, run } = consoleState;

  return (
    <main className="shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">Conduit Delivery Console</p>
          <h1>PM 到 PR 的端到端交付控制台</h1>
        </div>
        <StatusBadge run={run} loading={loading} />
      </section>

      <section className="workspace">
        <aside className="rail">
          <StageList run={run} loading={loading} />
        </aside>

        <MainPanel actions={actions} consoleState={consoleState} />
      </section>
    </main>
  );
}

function MainPanel({ actions, consoleState }) {
  const { error, input, loading, prRefs, run, setInput, setPrRefs, submission } = consoleState;
  return (
    <section className="main-panel">
      <div className="input-row">
        <textarea
          aria-label="PM requirement"
          placeholder="输入 PM 需求，例如：给文章列表加阅读量展示，前端假数据即可，不改后端。"
          value={input}
          onChange={(event) => setInput(event.target.value)}
        />
        <button disabled={loading} onClick={actions.start} title="Start run">
          {loading ? <Loader2 className="spin" /> : <Play />}
          <span>{loading ? "Running" : "Start run"}</span>
        </button>
      </div>

      {error ? <ErrorNotice message={error} /> : null}
      <CrossRunAiUsagePanel />
      {run ? (
        <RunResult
          actions={buildRunResultActions(actions)}
          loading={loading}
          onPrRefsChange={setPrRefs}
          prRefs={prRefs}
          run={run}
          submission={submission}
        />
      ) : (
        <EmptyState />
      )}
    </section>
  );
}

function StatusBadge({ loading, run }) {
  if (loading) return <span className="badge running">Running</span>;
  if (!run) return <span className="badge idle">Idle</span>;
  if (run.status === "failed") return <span className="badge failed">Failed</span>;
  if (run.status === "paused") return <span className="badge running">Paused</span>;
  return <span className="badge ready">{run.stage}</span>;
}

function StageList({ loading, run }) {
  const events = run ? requireRunEvents(run) : [];
  const seenStages = new Set(events.map((event) => event.stage));
  const failedStage = findFailedStage(run);

  return (
    <ol className="stages">
      {STAGES.map((stage) => (
        <li className={stageClass(stage, seenStages, failedStage)} key={stage.id}>
          <CheckCircle2 />
          <span>{stage.id}</span>
        </li>
      ))}
      {loading ? (
        <li className="active">
          <Loader2 className="spin" />
          <span>executing</span>
        </li>
      ) : null}
    </ol>
  );
}

function stageClass(stage, seenStages, failedStage) {
  if (!seenStages.has(stage.eventStage)) return "";
  if (failedStage === stage.eventStage) return "failed-step";
  return "done";
}

function findFailedStage(run) {
  if (run?.status !== "failed") return null;
  const events = requireRunEvents(run);
  const failedIndex = events.findLastIndex((event) => event.stage === "failed");
  if (failedIndex <= 0) return "failed";
  return events[failedIndex - 1].stage;
}

function EmptyState() {
  return (
    <div className="empty">
      <ScrollText />
      <p>运行后这里会展示需求卡片、方案、diff、验证结果和 PR 草稿。</p>
    </div>
  );
}
