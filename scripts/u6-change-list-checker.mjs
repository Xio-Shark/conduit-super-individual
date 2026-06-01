import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = process.env.U6_PROJECT_ROOT
  ? path.resolve(process.env.U6_PROJECT_ROOT)
  : fileURLToPath(new URL("..", import.meta.url));
const REGISTRY_PATH = "services/skills/src/registry.js";

export async function checkImplementationChangeList(options) {
  const text = await readProjectText(options.implementationChangeList);
  if (text === null) return fail("implementation-change-list", "missing or unreadable");

  const { paths, invalid } = parseChangeList(text);
  if (invalid.length) return fail("implementation-change-list", `invalid path(s): ${invalid.join(", ")}`);
  if (paths.length === 0) return fail("implementation-change-list", "must list at least one changed path");

  const required = requiredPaths(options);
  const missingRequired = [...required].filter((relativePath) => !paths.includes(relativePath));
  if (missingRequired.length) {
    return fail("implementation-change-list", `missing required Skill-layer path(s): ${missingRequired.join(", ")}`);
  }

  const disallowed = paths.filter((relativePath) => !isAllowedChange(relativePath, options));
  if (disallowed.length) {
    return fail("implementation-change-list", `disallowed mainline change(s): ${disallowed.join(", ")}`);
  }

  return pass("implementation-change-list", `${paths.length} path(s); no Agent/Orchestrator/API/Web mainline changes`);
}

function requiredPaths(options) {
  return new Set([normalizeProjectPath(options.skillFile), REGISTRY_PATH]);
}

function isAllowedChange(relativePath, options) {
  if (requiredPaths(options).has(relativePath)) return true;
  if (relativePath === normalizeProjectPath(options.recording)) return true;
  if (relativePath === normalizeProjectPath(options.implementationChangeList)) return true;
  if (relativePath.startsWith(`docs/reports/runs/${options.runId}/`)) return true;
  if (relativePath.startsWith("docs/reports/submission/u6-recordings/")) return true;
  if (relativePath.startsWith("docs/reports/submission/u6-change-lists/")) return true;
  if (relativePath.startsWith("docs/reports/submission/u6-rehearsal-manifest")) return true;
  if (relativePath.startsWith("sandbox-repo/")) return true;
  return false;
}

function parseChangeList(text) {
  const paths = [];
  const invalid = [];
  for (const line of text.split(/\r?\n/u)) {
    const parsed = parseChangeListLine(line);
    if (parsed === null) continue;
    const normalized = safeNormalizePath(parsed);
    if (normalized === null) invalid.push(parsed);
    else paths.push(normalized);
  }
  return { paths: [...new Set(paths)], invalid };
}

function parseChangeListLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const withoutStatus = /^[MADRCU?! ][MADRCU?! ]\s+/u.test(trimmed) ? trimmed.slice(3).trim() : trimmed;
  const withoutRename = withoutStatus.includes(" -> ") ? withoutStatus.split(" -> ").at(-1) : withoutStatus;
  const withoutNameStatus = withoutRename.includes("\t") ? withoutRename.split("\t").at(-1) : withoutRename;
  return withoutNameStatus.replace(/^"|"$/gu, "");
}

function safeNormalizePath(relativePath) {
  if (path.isAbsolute(relativePath)) return null;
  const normalized = normalizeProjectPath(relativePath);
  if (!normalized || normalized.split("/").includes("..")) return null;
  return normalized;
}

async function readProjectText(relativePath) {
  try {
    return await readFile(resolveProjectPath(relativePath), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function resolveProjectPath(relativePath) {
  const absolutePath = path.resolve(PROJECT_ROOT, normalizeProjectPath(relativePath));
  const relative = path.relative(PROJECT_ROOT, absolutePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`path escapes project root: ${relativePath}`);
  }
  return absolutePath;
}

function normalizeProjectPath(relativePath) {
  return relativePath.split(path.sep).join("/").replace(/^\/+/u, "").replace(/\/+$/u, "");
}

function pass(name, detail) { return { name, status: "passed", detail }; }
function fail(name, detail) { return { name, status: "failed", detail }; }
