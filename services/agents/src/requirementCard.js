const LEVELS = new Set(["L1", "L2", "L3"]);

export function validateRequirementCard(card) {
  requireObject(card, "requirement_card");
  requireNonEmptyString(card.id, "id");
  requireNonEmptyString(card.goal, "goal");
  requireNonEmptyString(card.source_input, "source_input");
  requireLevel(card.level);

  const scope = requireObject(card.scope, "scope");
  requireStringArray(scope.include, "scope.include");
  requireStringArray(scope.exclude, "scope.exclude");
  requireStringArray(card.assumptions, "assumptions");
  requireStringArray(card.clarifications, "clarifications");
  requireStringArray(card.acceptance, "acceptance");

  return card;
}

export function parseRequirementCardFromLlm(content) {
  const parsed = extractJsonObject(content);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("LLM clarify response must be a JSON object");
  }

  const card = {
    id: parsed.id,
    source_input: parsed.source_input,
    goal: parsed.goal,
    scope: {
      include: parsed.scope?.include,
      exclude: parsed.scope?.exclude,
    },
    assumptions: parsed.assumptions,
    clarifications: parsed.clarifications,
    acceptance: parsed.acceptance,
    level: parsed.level,
  };

  return validateRequirementCard(card);
}

function extractJsonObject(content) {
  const trimmed = String(content).trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  return JSON.parse(candidate);
}

function requireObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`requirement_card.${name} must be an object`);
  }
  return value;
}

function requireNonEmptyString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`requirement_card.${name} must be a non-empty string`);
  }
}

function requireStringArray(value, name) {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new Error(`requirement_card.${name} must be a non-empty string array`);
  }
}

function requireLevel(value) {
  if (!LEVELS.has(value)) {
    throw new Error(`requirement_card.level must be one of L1, L2, L3`);
  }
}
