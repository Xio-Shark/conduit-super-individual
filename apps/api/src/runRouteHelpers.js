export function sendRunNotFound(res) {
  return res.status(404).json({ error: { message: "Run not found" } });
}

export function findRun(runId, runStore) {
  return runStore.find(runId);
}
