import {
  requireAiUsageMatchesSummary,
  summarizeAiCalls,
} from "../../../services/orchestrator/src/aiUsage.js";

export const runEvidence = Object.freeze({
  array: requireRunArray,
  nonEmptyArray: requireRunNonEmptyArray,
  object: requireRunObject,
  optionalArray: optionalRunArray,
  text: requireRunNonEmptyText,
});

export const archiveEvidence = Object.freeze({
  array: requireArchiveArray,
  aiUsageMatchesCalls: requireArchiveAiUsageMatchesCalls,
  nonEmptyArray: requireArchiveNonEmptyArray,
  object: requireArchiveObject,
  optionalArray: optionalArchiveArray,
  optionalObject: optionalArchiveObject,
  optionalText: optionalArchiveText,
  text: requireArchiveNonEmptyText,
});

function requireRunObject(value, name) {
  if (!isObjectRecord(value)) {
    throw new Error(`Run result ${name} is required`);
  }
  return value;
}

function requireRunNonEmptyText(value, name) {
  if (!hasText(value)) {
    throw new Error(`Run result ${name} is required`);
  }
  return value;
}

function requireRunNonEmptyArray(value, name) {
  if (!hasItems(value)) {
    throw new Error(`Run result ${name} is required`);
  }
  return value;
}

function requireRunArray(value, name) {
  if (!Array.isArray(value)) {
    throw new Error(`Run result ${name} must be an array`);
  }
  return value;
}

function optionalRunArray(value, name) {
  if (value === undefined || value === null) return null;
  return requireRunArray(value, name);
}

function requireArchiveObject(value, name) {
  if (!isObjectRecord(value)) {
    throw new Error(`Archived run evidence ${name} must contain an object`);
  }
  return value;
}

function requireArchiveNonEmptyText(value, name) {
  if (!hasText(value)) {
    throw new Error(`Archived run evidence ${name} is empty`);
  }
  return value;
}

function requireArchiveNonEmptyArray(value, name) {
  if (!hasItems(value)) {
    throw new Error(`Archived run evidence ${name} is missing records`);
  }
  return value;
}

function requireArchiveArray(value, name) {
  if (!Array.isArray(value)) {
    throw new Error(`Archived run evidence ${name} must be an array`);
  }
  return value;
}

function optionalArchiveObject(value, name) {
  if (value === undefined || value === null) return null;
  return requireArchiveObject(value, name);
}

function optionalArchiveArray(value, name) {
  if (value === undefined || value === null) return null;
  return requireArchiveArray(value, name);
}

function optionalArchiveText(value, name) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new Error(`Archived run evidence ${name} must be a string`);
  }
  return value.trim() || null;
}

function requireArchiveAiUsageMatchesCalls(aiUsage, aiCalls) {
  const expected = summarizeAiCalls(aiCalls);
  requireAiUsageMatchesSummary(aiUsage, expected, "Archived run evidence aiUsage");
}

function isObjectRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasText(value) {
  return typeof value === "string" && value.trim() !== "";
}

function hasItems(value) {
  return Array.isArray(value) && value.length > 0;
}
