export function createLlmClient(env = process.env, fetchImpl = globalThis.fetch) {
  const apiKey = env.LLM_API_KEY?.trim();
  const baseUrl = env.LLM_BASE_URL?.trim();
  const model = env.LLM_MODEL?.trim();

  if (!apiKey) {
    throw new Error("LLM_API_KEY is required when AI_MODE=llm");
  }
  if (!baseUrl) {
    throw new Error("LLM_BASE_URL is required when AI_MODE=llm");
  }
  if (!model) {
    throw new Error("LLM_MODEL is required when AI_MODE=llm");
  }

  const chatUrl = resolveChatCompletionsUrl(baseUrl);

  return {
    model,
    async chat({ messages, temperature = 0.2 }) {
      const started = Date.now();
      const response = await fetchImpl(chatUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
        }),
      });

      const bodyText = await response.text();
      if (!response.ok) {
        throw new Error(`LLM request failed (${response.status}): ${truncate(bodyText, 300)}`);
      }

      let payload;
      try {
        payload = JSON.parse(bodyText);
      } catch {
        throw new Error("LLM response was not valid JSON");
      }

      const content = payload?.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) {
        throw new Error("LLM response missing message content");
      }

      const usage = requireUsage(payload.usage);
      const tokensIn = requireTokenCount(usage.prompt_tokens ?? usage.input_tokens, "prompt_tokens/input_tokens");
      const tokensOut = requireTokenCount(usage.completion_tokens ?? usage.output_tokens, "completion_tokens/output_tokens");
      const latencyMs = Date.now() - started;

      return {
        content,
        tokensIn,
        tokensOut,
        latencyMs,
        costEstimate: estimateCost(tokensIn, tokensOut),
      };
    },
  };
}

export function resolveChatCompletionsUrl(baseUrl) {
  let normalized = baseUrl.replace(/\/$/, "");
  // MiMo Token Plan: OpenAI-compat is /v1; /anthropic is Messages API (not chat/completions).
  if (normalized.endsWith("/anthropic")) {
    normalized = normalized.replace(/\/anthropic$/, "/v1");
  }
  if (normalized.endsWith("/chat/completions")) {
    return normalized;
  }
  if (normalized.endsWith("/v1")) {
    return `${normalized}/chat/completions`;
  }
  return `${normalized}/v1/chat/completions`;
}

function estimateCost(tokensIn, tokensOut) {
  const total = tokensIn + tokensOut;
  if (total <= 0) {
    return 0;
  }
  return Number((total * 0.000002).toFixed(6));
}

function requireUsage(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("LLM response missing usage");
  }
  return value;
}

function requireTokenCount(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`LLM response usage.${name} must be a positive number`);
  }
  return number;
}

function truncate(text, max) {
  const value = String(text);
  return value.length <= max ? value : `${value.slice(0, max)}...`;
}
