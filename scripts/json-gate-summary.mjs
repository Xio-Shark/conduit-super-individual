import { readFileSync } from "node:fs";

export function parseJsonSummary(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return parseLastJsonObject(trimmed);
  }
}

export function parseLastJsonObject(text) {
  const lines = String(text ?? "").trim().split(/\r?\n/u);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (!lines[index].trim().startsWith("{")) continue;
    const candidate = lines.slice(index).join("\n").trim();
    try {
      return JSON.parse(candidate);
    } catch {
      // Keep scanning upward; earlier output may contain the start of the final JSON object.
    }
  }
  return null;
}

export function countChecks(checks) {
  return {
    total: checks.length,
    passed: checks.filter((check) => check?.status === "passed").length,
    failed: checks.filter((check) => check?.status === "failed").length,
  };
}

export function summaryConsistencyErrors(summary, label = "command JSON summary") {
  if (!summary) return [];
  const errors = [];
  if (!Object.hasOwn(summary, "status")) {
    errors.push(`${label} is missing status`);
    return errors;
  }
  if (summary.status !== "passed" && summary.status !== "failed") {
    errors.push(`${label} has invalid status: ${String(summary.status)}`);
    return errors;
  }
  if (summary.mode !== undefined && (typeof summary.mode !== "string" || !summary.mode.trim())) {
    errors.push(`${label} has invalid mode: ${String(summary.mode)}`);
    return errors;
  }
  if (!Array.isArray(summary.checks)) {
    errors.push(`${label} is missing checks[]`);
    return errors;
  }
  if (summary.checks.length === 0) {
    errors.push(`${label} has empty checks[]`);
    return errors;
  }
  const invalidCheckShapeIndex = summary.checks.findIndex((check) => !check || typeof check !== "object" || Array.isArray(check));
  if (invalidCheckShapeIndex !== -1) {
    errors.push(`${label} has non-object check at index ${invalidCheckShapeIndex}`);
    return errors;
  }
  const invalidCheckName = summary.checks.find((check) => typeof check.name !== "string" || !check.name.trim());
  if (invalidCheckName) {
    errors.push(`${label} has check with invalid name: ${String(invalidCheckName.name)}`);
    return errors;
  }
  const invalidCheck = summary.checks.find((check) => check?.status !== "passed" && check?.status !== "failed");
  if (invalidCheck) {
    errors.push(`${label} has check ${String(invalidCheck.name ?? "<unnamed>")} with invalid status: ${String(invalidCheck.status)}`);
    return errors;
  }
  const invalidFailedDetailCheck = summary.checks.find((check) => check.status === "failed" && (typeof check.detail !== "string" || !check.detail.trim()));
  if (invalidFailedDetailCheck) {
    errors.push(`${label} has failed check ${invalidFailedDetailCheck.name} with invalid detail: ${String(invalidFailedDetailCheck.detail)}`);
    return errors;
  }
  const invalidOptionalDetailCheck = summary.checks.find((check) => check.detail !== undefined && (typeof check.detail !== "string" || !check.detail.trim()));
  if (invalidOptionalDetailCheck) {
    errors.push(`${label} has check ${invalidOptionalDetailCheck.name} with invalid detail: ${String(invalidOptionalDetailCheck.detail)}`);
    return errors;
  }
  const invalidCategoryCheck = summary.checks.find((check) => check.category !== undefined && (typeof check.category !== "string" || !check.category.trim()));
  if (invalidCategoryCheck) {
    errors.push(`${label} has check ${String(invalidCategoryCheck.name ?? "<unnamed>")} with invalid category: ${String(invalidCategoryCheck.category)}`);
    return errors;
  }
  const nonArrayEvidenceCheck = summary.checks.find((check) => check.evidence !== undefined && !Array.isArray(check.evidence));
  if (nonArrayEvidenceCheck) {
    errors.push(`${label} has check ${nonArrayEvidenceCheck.name} with non-array evidence`);
    return errors;
  }
  const emptyEvidenceCheck = summary.checks.find((check) => Array.isArray(check.evidence) && check.evidence.length === 0);
  if (emptyEvidenceCheck) {
    errors.push(`${label} has check ${emptyEvidenceCheck.name} with empty evidence[]`);
    return errors;
  }
  for (const check of summary.checks) {
    if (check.evidence === undefined) continue;
    const invalidEvidenceIndex = check.evidence.findIndex((item) => typeof item !== "string" || !item.trim());
    if (invalidEvidenceIndex !== -1) {
      errors.push(`${label} has check ${check.name} with invalid evidence at index ${invalidEvidenceIndex}: ${String(check.evidence[invalidEvidenceIndex])}`);
      return errors;
    }
  }
  const failedChecks = summary.checks.filter((check) => check.status === "failed");
  if (summary.status === "passed" && failedChecks.length > 0) {
    errors.push(`${label} reports passed but has ${failedChecks.length} failed check(s)`);
  }
  if (summary.status === "failed" && failedChecks.length === 0) {
    errors.push(`${label} reports failed but has no failed check(s)`);
  }
  if (summary.checkCounts !== undefined) {
    if (!summary.checkCounts || typeof summary.checkCounts !== "object" || Array.isArray(summary.checkCounts)) {
      errors.push(`${label} checkCounts must be an object`);
      return errors;
    }
    for (const key of ["total", "passed", "failed"]) {
      const value = summary.checkCounts[key];
      if (!Number.isInteger(value) || value < 0) {
        errors.push(`${label} checkCounts.${key} must be a non-negative integer`);
        return errors;
      }
    }
    const actual = countChecks(summary.checks);
    for (const key of ["total", "passed", "failed"]) {
      if (summary.checkCounts[key] !== actual[key]) {
        errors.push(`${label} checkCounts.${key}=${String(summary.checkCounts[key])} does not match checks[] ${key}=${actual[key]}`);
        break;
      }
    }
  }
  if (summary.categories === undefined && summary.checks.some((check) => check.category !== undefined)) {
    errors.push(`${label} is missing categories for checks[] categories`);
    return errors;
  }
  if (summary.categories !== undefined) {
    const categoryErrors = categoryConsistencyErrors(summary, label);
    if (categoryErrors.length) {
      errors.push(categoryErrors[0]);
      return errors;
    }
  }
  return errors;
}

function categoryConsistencyErrors(summary, label) {
  const errors = [];
  if (!summary.categories || typeof summary.categories !== "object" || Array.isArray(summary.categories)) {
    errors.push(`${label} categories must be an object`);
    return errors;
  }
  const actual = countCategories(summary.checks);
  for (const category of Object.keys(actual)) {
    if (!Object.hasOwn(summary.categories, category)) {
      errors.push(`${label} categories is missing category ${category} from checks[]`);
      return errors;
    }
  }
  for (const [category, counts] of Object.entries(summary.categories)) {
    if (!category.trim()) {
      errors.push(`${label} categories must not include an empty category name`);
      return errors;
    }
    if (!Object.hasOwn(actual, category)) {
      errors.push(`${label} categories.${category} has no matching checks[] category`);
      return errors;
    }
    if (!counts || typeof counts !== "object" || Array.isArray(counts)) {
      errors.push(`${label} categories.${category} must be an object`);
      return errors;
    }
    for (const key of ["total", "failed"]) {
      const value = counts[key];
      if (!Number.isInteger(value) || value < 0) {
        errors.push(`${label} categories.${category}.${key} must be a non-negative integer`);
        return errors;
      }
    }
    if (counts.failed > counts.total) {
      errors.push(`${label} categories.${category}.failed=${counts.failed} exceeds total=${counts.total}`);
      return errors;
    }
    for (const key of ["total", "failed"]) {
      const value = counts[key];
      if (value !== actual[category]?.[key]) {
        errors.push(`${label} categories.${category}.${key}=${value} does not match checks[] category ${key}=${actual[category]?.[key] ?? 0}`);
        return errors;
      }
    }
  }
  return errors;
}

function countCategories(checks) {
  const categories = {};
  for (const check of checks) {
    if (check.category === undefined) continue;
    const current = categories[check.category] ?? { total: 0, failed: 0 };
    current.total += 1;
    if (check.status === "failed") current.failed += 1;
    categories[check.category] = current;
  }
  return categories;
}

export function commandFailureDetail(exitCode, summary, consistencyErrors = summaryConsistencyErrors(summary)) {
  if (!summary) return "command did not emit a parseable JSON summary";
  if (!Object.hasOwn(summary, "status")) return "command JSON summary is missing status";
  if (summary.status !== "passed" && summary.status !== "failed") {
    return `command JSON summary has invalid status: ${String(summary.status)}`;
  }
  if (consistencyErrors.length) return consistencyErrors[0];
  if (exitCode !== 0 && summary.status === "passed") {
    return `command exited ${exitCode} but reported status=passed`;
  }
  return undefined;
}

function jsonGateFailure(summary) {
  if (!summary) return "JSON gate did not emit a parseable JSON summary";
  if (!Object.hasOwn(summary, "status")) return "JSON gate summary is missing status";
  if (summary.status !== "passed" && summary.status !== "failed") {
    return `JSON gate reported status=${String(summary.status)}`;
  }
  const errors = summaryConsistencyErrors(summary, "JSON gate summary");
  if (errors.length) return errors[0].replace("JSON gate summary checkCounts", "JSON gate checkCounts");
  const failedChecks = Array.isArray(summary.checks)
    ? summary.checks.filter((check) => check.status === "failed")
    : [];
  if (failedChecks.length > 0) {
    return `JSON gate reported status=${summary.status} with ${failedChecks.length} failed check(s)`;
  }
  if (summary.status === "failed") return "JSON gate reported status=failed";
  return null;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const summary = parseJsonSummary(readFileSync(0, "utf8"));
  const failure = jsonGateFailure(summary);
  if (failure) {
    console.log(`FAIL: ${failure}`);
    process.exit(1);
  }
}
