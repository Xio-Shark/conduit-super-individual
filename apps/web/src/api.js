export class ApiRequestError extends Error {
  constructor(message, payload = {}) {
    super(message);
    this.name = "ApiRequestError";
    this.path = payload.path;
    this.status = payload.status;
    this.body = payload.body;
    this.run = payload.run;
  }
}

export function createRun(input) {
  return requestJson("/api/runs", {
    method: "POST",
    body: { input },
    errorMessage: "Run failed",
  });
}

export function retryRun(runId, input) {
  return requestJson(`/api/runs/${runId}/retry`, {
    method: "POST",
    body: { input },
    errorMessage: "Retry failed",
  });
}

export function resumeFromStage(runId, { stage, revisedInput } = {}) {
  return requestJson(`/api/runs/${runId}/resume-from-stage`, {
    method: "POST",
    body: { stage, revisedInput },
    errorMessage: "Resume from stage failed",
  });
}

export function confirmRun(runId, target) {
  return requestJson(`/api/runs/${runId}/confirm`, {
    method: "POST",
    body: { target, decision: "approved" },
    errorMessage: "Confirm failed",
  });
}

export function submitPr(runId, refs) {
  return requestJson(`/api/runs/${runId}/pr`, {
    method: "POST",
    body: { confirm: true, head: refs.head, base: refs.base },
    errorMessage: "PR submission failed",
  });
}

export function loadSubmission(runId) {
  return requestJson(`/api/runs/${runId}/submission`, {
    errorMessage: "Submission summary failed",
  });
}

export function loadAiUsageSummary() {
  return requestJson("/api/ai-usage/summary", {
    errorMessage: "AI usage summary failed",
  });
}

export function continueRun(runId) {
  return requestJson(`/api/runs/${runId}/continue`, {
    method: "POST",
    errorMessage: "Continue run failed",
  });
}

export function answerClarification(runId, { questionId, question, answer }) {
  const body = { questionId, answer };
  if (question !== undefined) body.question = question;
  return requestJson(`/api/runs/${runId}/answer-clarification`, {
    method: "POST",
    body,
    errorMessage: "Answer clarification failed",
  });
}

export function loadClarificationHistory(runId) {
  return requestJson(`/api/runs/${runId}/clarification-history`, {
    errorMessage: "Clarification history fetch failed",
  });
}

async function requestJson(path, { method = "GET", body, errorMessage }) {
  const init = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  const response = await fetch(path, init);
  const payload = parseJsonPayload(await response.text(), { path, status: response.status });
  if (!response.ok) {
    throw new ApiRequestError(requireErrorMessage(payload, errorMessage), {
      ...payload,
      path,
      status: response.status,
    });
  }
  return payload;
}

function parseJsonPayload(text, context) {
  if (!text.trim()) {
    throw new ApiRequestError(
      `API returned an empty response for ${context.path} (${context.status})`,
      { ...context, body: "" },
    );
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new ApiRequestError(
      `API returned invalid JSON for ${context.path} (${context.status}): ${error.message}`,
      { ...context, body: text.slice(0, 240) },
    );
  }
}

function requireErrorMessage(payload, errorMessage) {
  if (typeof payload.error?.message === "string" && payload.error.message.trim()) {
    return payload.error.message;
  }
  throw new ApiRequestError(`API error response missing error.message: ${errorMessage}`, {
    path: payload.path,
    status: payload.status,
    body: payload,
  });
}
