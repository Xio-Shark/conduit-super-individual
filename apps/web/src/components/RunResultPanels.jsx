import {
  ConfirmButton,
  List,
  Panel,
} from "./RunResultCommon.jsx";
import { ClarificationsPanel } from "./ClarificationsPanel.jsx";

export function RequirementPanel({
  onConfirm,
  requirementCard,
  runId,
  pendingQuestions = [],
  clarificationHistory = [],
  onClarificationAnswered,
}) {
  if (!requirementCard) return null;

  return (
    <Panel title="Requirement">
      <h2>{requirementCard.goal}</h2>
      <p>{requirementCard.source_input}</p>
      <ClarificationsPanel
        runId={runId}
        clarifications={requirementCard.clarifications}
        pendingQuestions={pendingQuestions}
        history={clarificationHistory}
        onAnswered={onClarificationAnswered}
      />
      <List items={requirementCard.acceptance} />
      <ConfirmButton onConfirm={onConfirm} target="requirement" />
    </Panel>
  );
}

export function PlanPanel({ onConfirm, plan }) {
  if (!plan) return null;

  return (
    <Panel title="Plan">
      <p>{plan.summary}</p>
      <p className="muted">Skill: {plan.skill_id}</p>
      {plan.history_references?.length ? (
        <HistoryReferences references={plan.history_references} />
      ) : null}
      {plan.impact_matrix?.cross_stack ? (
        <p className="muted">Cross-stack: frontend + backend</p>
      ) : null}
      <List items={plan.target_files} />
      <ConfirmButton onConfirm={onConfirm} target="plan" />
    </Panel>
  );
}

function HistoryReferences({ references }) {
  return (
    <div className="history-refs">
      <p className="muted">History references</p>
      <List
        items={references.map(
          (ref) => `${ref.run_id} (${ref.score}): ${ref.goal}`,
        )}
      />
    </div>
  );
}
