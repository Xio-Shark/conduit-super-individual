import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { RUN_STAGES } from "../../../libs/types/src/stages.js";
import { RESUME_STAGE_ORDER } from "./deliveryConfig.js";

export function normalizeResumeStage(stage) {
  const normalized = requireString(stage, "stage").toLowerCase();
  const aliases = {
    clarify: RUN_STAGES.CLARIFYING,
    clarifying: RUN_STAGES.CLARIFYING,
    plan: RUN_STAGES.PLANNING,
    planning: RUN_STAGES.PLANNING,
    edit: RUN_STAGES.EDITING,
    editing: RUN_STAGES.EDITING,
    verify: RUN_STAGES.VERIFYING,
    verifying: RUN_STAGES.VERIFYING,
    pr: RUN_STAGES.PR_DRAFTING,
    pr_drafting: RUN_STAGES.PR_DRAFTING,
  };
  const resolved = aliases[normalized] || normalized;
  if (!RESUME_STAGE_ORDER.includes(resolved)) {
    throw new Error(`resume-from-stage must be one of: ${RESUME_STAGE_ORDER.join(", ")}`);
  }
  return resolved;
}

export function requireRequirementInput(input) {
  if (typeof input !== "string" || input.trim() === "") {
    throw new Error("Requirement input is required");
  }
  return input.trim();
}

export function requireString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} is required`);
  }
  return value.trim();
}

export async function readMarkdownJson(filePath) {
  const text = await readText(filePath);
  const match = text.match(/```json\n([\s\S]*?)\n```/);
  if (!match) throw new Error(`Missing JSON block in ${filePath}`);
  return JSON.parse(match[1]);
}

export async function readJson(filePath) {
  return JSON.parse(await readText(filePath));
}

export async function readOptionalJson(filePath) {
  if (!existsSync(filePath)) return null;
  return readJson(filePath);
}

export function readText(filePath) {
  return readFile(filePath, "utf8");
}
