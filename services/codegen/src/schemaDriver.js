import path from "node:path";
import fs from "node:fs/promises";

const MODELS_DIR = "backend/models";
const VALID_OPS = new Set(["add", "modify", "remove"]);

export async function readModelSchema(repoPath, modelName) {
  assertNonEmptyString(repoPath, "repoPath");
  assertNonEmptyString(modelName, "modelName");
  const relPath = `${MODELS_DIR}/${modelName}.js`;
  const absPath = path.join(repoPath, relPath);
  const source = await fs.readFile(absPath, "utf8");
  const initBlock = extractInitBlock(source);
  if (!initBlock) {
    throw new Error(`schemaDriver: cannot locate ${modelName}.init({...}) in ${relPath}`);
  }
  return {
    model: modelName,
    modelPath: relPath,
    fields: parseFields(initBlock),
  };
}

export function diffSchema(currentSchema, change) {
  assertChangeShape(change);
  if (currentSchema.model !== change.model) {
    throw new Error(
      `schemaDriver: model mismatch (current=${currentSchema.model}, change=${change.model})`,
    );
  }
  const existing = currentSchema.fields.find((field) => field.name === change.field);
  if (change.op === "add" && existing) {
    throw new Error(`schemaDriver: field ${change.model}.${change.field} already exists`);
  }
  if ((change.op === "modify" || change.op === "remove") && !existing) {
    throw new Error(`schemaDriver: field ${change.model}.${change.field} not found`);
  }
  return Object.freeze({
    model: change.model,
    field: change.field,
    type: change.type,
    op: change.op,
    currentType: existing?.type ?? null,
    modelPath: currentSchema.modelPath,
  });
}

export async function inferFrontendTargets(repoPath, change) {
  assertChangeShape(change);
  const modelLower = change.model.toLowerCase();
  const pluralLower = `${modelLower}s`;
  const candidates = [
    `frontend/src/types/${change.model}.ts`,
    `frontend/src/services/${pluralLower}.js`,
    `frontend/src/__mocks__/${pluralLower}.js`,
  ];

  const existing = [];
  const newlyGenerated = [];
  for (const rel of candidates) {
    const abs = path.join(repoPath, rel);
    try {
      await fs.access(abs);
      existing.push(rel);
    } catch {
      newlyGenerated.push(rel);
    }
  }

  return Object.freeze({
    backendPaths: Object.freeze([`${MODELS_DIR}/${change.model}.js`]),
    frontendPaths: Object.freeze({
      existing: Object.freeze(existing),
      newlyGenerated: Object.freeze(newlyGenerated),
    }),
  });
}

export async function planSchemaChange(repoPath, change) {
  const current = await readModelSchema(repoPath, change.model);
  const diff = diffSchema(current, change);
  const targets = await inferFrontendTargets(repoPath, change);
  return Object.freeze({
    change: diff,
    targets,
    targetFiles: Object.freeze([
      ...targets.backendPaths,
      ...targets.frontendPaths.existing,
      ...targets.frontendPaths.newlyGenerated,
    ]),
  });
}

function extractInitBlock(source) {
  const match = source.match(/\.init\(\s*\{([\s\S]*?)\}\s*,\s*\{/);
  return match ? match[1] : null;
}

function parseFields(block) {
  const fields = [];
  for (const line of block.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//")) continue;
    const simple = trimmed.match(/^(\w+):\s*DataTypes\.(\w+)/);
    if (simple) {
      fields.push({ name: simple[1], type: simple[2] });
      continue;
    }
    const complex = trimmed.match(/^(\w+):\s*\{/);
    if (complex) {
      fields.push({ name: complex[1], type: "OBJECT" });
    }
  }
  return fields;
}

function assertChangeShape(change) {
  if (!change || typeof change !== "object") {
    throw new Error("schemaDriver: change must be an object");
  }
  assertNonEmptyString(change.model, "change.model");
  assertNonEmptyString(change.field, "change.field");
  assertNonEmptyString(change.type, "change.type");
  if (!VALID_OPS.has(change.op)) {
    throw new Error(`schemaDriver: change.op must be one of ${[...VALID_OPS].join("|")}`);
  }
}

function assertNonEmptyString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`schemaDriver: ${label} must be a non-empty string`);
  }
}
