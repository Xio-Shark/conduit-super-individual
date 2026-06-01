import {
  readModelSchema,
  diffSchema,
  inferFrontendTargets,
} from "../../codegen/src/schemaDriver.js";
import {
  generateType,
  generateServiceStub,
  generateMock,
} from "../../codegen/src/frontendGenerators.js";

const TYPE_DIR = "frontend/src/types";
const SERVICE_DIR = "frontend/src/services";
const MOCK_DIR = "frontend/src/__mocks__";
const PREVIEW_PATH = "frontend/src/components/ArticlesPreview/ArticlesPreview.jsx";

export async function resolveSchemaDrivenTargets(repoPath, schemaChange) {
  const currentSchema = await readModelSchema(repoPath, schemaChange.model);
  const existing = currentSchema.fields.find((field) => field.name === schemaChange.field);
  const alreadyApplied = schemaChange.op === "add" && Boolean(existing);
  const change = alreadyApplied
    ? Object.freeze({
        model: schemaChange.model,
        field: schemaChange.field,
        type: schemaChange.type,
        op: schemaChange.op,
        currentType: existing.type,
        modelPath: currentSchema.modelPath,
      })
    : diffSchema(currentSchema, schemaChange);
  const targets = await inferFrontendTargets(repoPath, change);
  const plural = change.model.toLowerCase() + "s";
  const generated = {
    typePath: `${TYPE_DIR}/${change.model}.ts`,
    servicePath: `${SERVICE_DIR}/${plural}.js`,
    mockPath: `${MOCK_DIR}/${plural}.js`,
  };
  const controllerPath = `backend/controllers/${plural}.js`;
  const targetFiles = [
    change.modelPath,
    controllerPath,
    PREVIEW_PATH,
    generated.typePath,
    generated.servicePath,
    generated.mockPath,
  ];
  return Object.freeze({
    currentSchema,
    change,
    targets,
    generated,
    controllerPath,
    previewPath: PREVIEW_PATH,
    targetFiles,
    alreadyApplied,
  });
}

export async function applySchemaDrivenChange(sandbox, schemaChange) {
  if (!sandbox?.repoPath) {
    throw new Error("applySchemaDrivenChange: sandbox.repoPath is required");
  }
  const plan = await resolveSchemaDrivenTargets(sandbox.repoPath, schemaChange);
  const { change, currentSchema, generated, controllerPath, previewPath, alreadyApplied } = plan;
  const changedFiles = [];

  if (!alreadyApplied) {
    const modelText = await sandbox.readText(change.modelPath);
    const updatedModel = injectFieldIntoModel(modelText, change);
    if (updatedModel === modelText) {
      throw new Error(`schemaDrivenSkill: failed to inject ${change.field} into ${change.modelPath}`);
    }
    await sandbox.writeText(change.modelPath, updatedModel);
    changedFiles.push(change.modelPath);
  } else {
    changedFiles.push(change.modelPath);
  }

  const controllerInjected = await maybeInjectController(sandbox, change, controllerPath);
  if (controllerInjected) changedFiles.push(controllerPath);

  const previewInjected = await maybeInjectPreview(sandbox, change, previewPath);
  if (previewInjected) changedFiles.push(previewPath);

  await sandbox.writeText(generated.typePath, generateType(change, currentSchema));
  await sandbox.writeText(generated.servicePath, generateServiceStub(change));
  await sandbox.writeText(generated.mockPath, generateMock(change));
  changedFiles.push(generated.typePath, generated.servicePath, generated.mockPath);

  return {
    changedFiles,
    summary: alreadyApplied
      ? `schemaDriver re-generated frontend artifacts for ${change.model}.${change.field} (backend already applied)`
      : `schemaDriver auto-generated cross-stack files for ${change.model}.${change.field}`,
  };
}

function injectFieldIntoModel(source, change) {
  const fieldDecl = `      ${change.field}: DataTypes.${change.type},`;
  const initPattern = /(\.init\(\s*\{[\s\S]*?)(\n\s*\},\s*\n\s*\{)/;
  if (!initPattern.test(source)) {
    throw new Error(`schemaDrivenSkill: cannot locate Model.init block for ${change.model}`);
  }
  return source.replace(initPattern, `$1\n${fieldDecl}$2`);
}

async function maybeInjectController(sandbox, change, controllerPath) {
  let source;
  try {
    source = await sandbox.readText(controllerPath);
  } catch {
    return false;
  }
  if (source.includes(`${change.field}: ${change.field}`) || source.includes(`${change.field}: req.body.${change.field}`)) {
    return true;
  }
  const createPattern = new RegExp(`(${change.model}\\.create\\(\\{[\\s\\S]*?)(\\n\\s*\\}\\);)`);
  if (!createPattern.test(source)) {
    return false;
  }
  const fieldDecl = `      ${change.field}: req.body.${change.field} ?? null,`;
  const updated = source.replace(createPattern, `$1\n${fieldDecl}$2`);
  await sandbox.writeText(controllerPath, updated);
  return true;
}

async function maybeInjectPreview(sandbox, change, previewPath) {
  let source;
  try {
    source = await sandbox.readText(previewPath);
  } catch {
    return false;
  }
  if (source.includes(`article.${change.field}`)) {
    return true;
  }
  const titleAnchor = "<h1>{article.title}</h1>";
  if (!source.includes(titleAnchor)) {
    return false;
  }
  const injection = `<h1>{article.title}</h1>\n          {article.${change.field} ? (\n            <img src={article.${change.field}} alt={\`\${article.title} ${change.field}\`} className="${change.field}-thumb" />\n          ) : null}`;
  await sandbox.writeText(previewPath, source.replace(titleAnchor, injection));
  return true;
}
