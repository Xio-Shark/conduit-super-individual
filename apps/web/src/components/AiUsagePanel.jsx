import {
  EvidencePanelFrame,
  UsageMetric,
} from "./RunResultCommon.jsx";

export function AiUsagePanel({ aiCalls, aiUsage, state }) {
  return (
    <EvidencePanelFrame state={state} title="AI Usage">
      <AiUsageContent aiCalls={aiCalls} aiUsage={aiUsage} />
    </EvidencePanelFrame>
  );
}

function AiUsageContent({ aiCalls, aiUsage }) {
  const hasLlmMetrics = aiUsage.tokensIn + aiUsage.tokensOut > 0;

  return (
    <>
      {hasLlmMetrics ? (
        <p className="usage-llm-badge">LLM metrics recorded (non-zero tokens)</p>
      ) : (
        <p className="muted">Rules mode or zero-token run</p>
      )}
      <div className="usage-grid">
        <UsageMetric label="tokens in" value={aiUsage.tokensIn} />
        <UsageMetric label="tokens out" value={aiUsage.tokensOut} />
        <UsageMetric label="latency" value={`${aiUsage.latencyMs}ms`} />
        <UsageMetric label="cost" value={formatCost(aiUsage.costEstimate)} />
      </div>
      <div className="usage-calls">
        {aiCalls.map((call) => (
          <div className="usage-call" key={`${call.stage}-${call.model}`}>
            <span>{call.stage}</span>
            <strong>{call.model}</strong>
            <small>{call.status}</small>
          </div>
        ))}
      </div>
    </>
  );
}

function formatCost(value) {
  if (value === null || value === undefined) return "missing";
  return Number(value).toFixed(4);
}
