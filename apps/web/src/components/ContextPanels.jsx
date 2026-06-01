import {
  MissingEvidencePanel,
  Panel,
} from "./RunResultCommon.jsx";

export function EventsPanel({ events }) {
  return (
    <PanelList
      className="events"
      items={events}
      renderItem={(event) => (
        <div className="event" key={`${event.at}-${event.stage}-${event.message}`}>
          <span>{event.stage}</span>
          <p>{event.message}</p>
        </div>
      )}
      title="Events"
    />
  );
}

export function SubmissionPanel({ submission }) {
  return (
    <PanelList
      className="submission"
      items={submission.items}
      renderItem={(item) => (
        <div className="submission-item" key={item.id}>
          <span>{item.label}</span>
          <strong>{item.status}</strong>
        </div>
      )}
      title="Submission"
    />
  );
}

export function HumanReviewPanel({ confirmations }) {
  return (
    <PanelList
      className="confirmations"
      items={confirmations}
      renderItem={(confirmation) => (
        <div className="confirmation" key={`${confirmation.target}-${confirmation.at}`}>
          <span>{confirmation.target}</span>
          <strong>{confirmation.decision}</strong>
        </div>
      )}
      title="Human Review"
    />
  );
}

function PanelList({ className, items, renderItem, title }) {
  return (
    <Panel title={title}>
      <div className={className}>
        {items.map(renderItem)}
      </div>
    </Panel>
  );
}

export function HistoryContext({ historyRecall }) {
  if (!historyRecall?.matches?.length) {
    if (historyRecall?.status === "degraded") {
      return (
        <MissingEvidencePanel
          detail={`Skipped ${historyRecall.skipped?.length ?? 0} incomplete archives.`}
          title="History Context"
        />
      );
    }
    return null;
  }

  return (
    <Panel title="History Context">
      {historyRecall.status === "degraded" ? (
        <p className="muted">
          Degraded recall ({historyRecall.skipped?.length ?? 0} incomplete archives skipped)
        </p>
      ) : null}
      <div className="history-list">
        {historyRecall.matches.map((match) => (
          <div className="history-item" key={match.runId}>
            <div>
              <strong>{match.goal}</strong>
              <p>{match.summary}</p>
              <span>{match.skillId || "no skill"}</span>
            </div>
            <span className="score">{Math.round(match.score * 100)}%</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}
