export function record(events, stage, message) {
  events.push({
    at: new Date().toISOString(),
    stage,
    message,
  });
}

export async function writeCheckpoint(context, stage, artifacts) {
  context.checkpoints[stage] = {
    at: new Date().toISOString(),
    artifacts,
  };
}
