export class PrSubmissionError extends Error {}

export async function submitDraftPr({ env, gitProvider, requestBody, run, runStore }) {
  validatePrRequest(run, requestBody);

  const client = gitProvider(env);
  const pr = await client.createPullRequest({
    title: buildPrTitle(run),
    body: run.prDraft,
    head: requestBody.head,
    base: requestBody.base,
    draft: requestBody.draft !== false,
  });
  const submittedAt = new Date().toISOString();
  const prSubmission = {
    ...pr,
    submittedAt,
  };
  const nextRun = {
    ...run,
    prSubmission,
    events: [
      ...run.events,
      {
        at: submittedAt,
        stage: "pr_submitted",
        message: `created PR ${pr.url || pr.number}`,
      },
    ],
  };
  await runStore.persistMetadata(nextRun);
  runStore.set(nextRun);
  return nextRun;
}

function validatePrRequest(run, requestBody) {
  if (requestBody?.confirm !== true) {
    throw new PrSubmissionError("PR submission requires confirm=true");
  }
  if (!run.prDraft) {
    throw new PrSubmissionError("PR draft is unavailable");
  }
  if (!run.requirementCard?.goal) {
    throw new PrSubmissionError("Requirement goal is required for PR title");
  }
  if (!requestBody.head) {
    throw new PrSubmissionError("PR submission requires head");
  }
  if (!requestBody.base) {
    throw new PrSubmissionError("PR submission requires base");
  }
}

function buildPrTitle(run) {
  return `P0: ${run.requirementCard.goal}`;
}
