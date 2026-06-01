import { useEffect, useState } from "react";
import { loadAiUsageSummary } from "../api.js";
import {
  Panel,
  UsageMetric,
} from "./RunResultCommon.jsx";

function formatCost(value) {
  if (!Number.isFinite(value) || value <= 0) return "0";
  return value < 0.01 ? value.toFixed(4) : value.toFixed(3);
}

export function CrossRunAiUsagePanel() {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    loadAiUsageSummary()
      .then((payload) => {
        if (active) setSummary(payload);
      })
      .catch((loadError) => {
        if (active) setError(loadError.message);
      });
    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return (
      <Panel title="Cross-run AI Usage">
        <p className="muted">{error}</p>
      </Panel>
    );
  }

  if (!summary) {
    return (
      <Panel title="Cross-run AI Usage">
        <p className="muted">Loading archived run metrics…</p>
      </Panel>
    );
  }

  const hasLlmMetrics = summary.totals.tokensIn + summary.totals.tokensOut > 0;
  const isMissing = summary.status === "missing";

  return (
    <Panel title="Cross-run AI Usage">
      <p className="muted">
        {isMissing
          ? "No passed archived run with valid ai-calls.jsonl is available."
          : `Aggregated from ${summary.runCount} passed archived runs with ai-calls.jsonl${hasLlmMetrics ? " · non-zero LLM totals" : ""}.`}
        {summary.skipped?.length ? ` Skipped ${summary.skipped.length} incomplete or failed runs.` : ""}
      </p>
      <div className="usage-grid">
        <UsageMetric label="runs" value={summary.runCount} />
        <UsageMetric label="skipped" value={summary.skipped?.length ?? 0} />
        <UsageMetric label="tokens in" value={summary.totals.tokensIn} />
        <UsageMetric label="tokens out" value={summary.totals.tokensOut} />
        <UsageMetric label="latency" value={`${summary.totals.latencyMs}ms`} />
        <UsageMetric label="cost" value={formatCost(summary.totals.costEstimate)} />
      </div>
      <CrossRunList summary={summary} />
    </Panel>
  );
}

function CrossRunList({ summary }) {
  const runs = summary.byRun?.length ? summary.byRun : summary.runs;
  if (!runs?.length) return null;

  return (
    <ol className="cross-run-list">
      {runs.slice(0, 8).map((run) => (
        <li key={run.runId}>
          <strong>{run.runId}</strong>
          <span className="muted">{runSummary(run)}</span>
        </li>
      ))}
    </ol>
  );
}

function runSummary(run) {
  if (run.summary) {
    return `${run.primaryModel} · in ${run.summary.tokensIn} · out ${run.summary.tokensOut}`;
  }
  return `in ${run.tokensIn} · out ${run.tokensOut} · ${run.latencyMs}ms`;
}
