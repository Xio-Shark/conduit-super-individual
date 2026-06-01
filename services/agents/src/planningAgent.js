import { buildSandboxIndex, readSandboxFileIndex } from "../../index/src/sandboxIndex.js";
import { resolveSchemaDrivenTargets } from "../../skills/src/schemaDrivenSkill.js";
import { planWithLlm } from "./planWithLlm.js";

export async function buildPlan({ requirementCard, sandbox, skill, historyRecall, repoPath, env = process.env, modelClient }) {
  const planMode = normalizePlanMode(env);
  const resolvedRepoPath = requireRepoPath(repoPath, sandbox);
  const targets = await resolveSkillTargets(skill, resolvedRepoPath);
  await sandbox.assertFiles(targets.assertablePaths);

  const historyReferences = buildHistoryReferences(historyRecall);
  const impactMatrix = buildImpactMatrix(requirementCard, targets.targetFiles);
  const sandboxIndex = await buildSandboxIndex(resolvedRepoPath);
  const targetIndex = await readSandboxFileIndex(resolvedRepoPath, targets.assertablePaths);

  const basePlan = {
    summary: planSummary(skill),
    requirement_id: requirementCard.id,
    skill_id: skill.id,
    skill_version: skill.version,
    impacted_modules: impactMatrix.modules,
    impact_matrix: impactMatrix,
    history_references: historyReferences,
    target_files: targets.targetFiles,
    target_files_source: targets.source,
    schema_resolution: targets.schemaResolution
      ? {
          model: targets.schemaResolution.change.model,
          field: targets.schemaResolution.change.field,
          type: targets.schemaResolution.change.type,
          op: targets.schemaResolution.change.op,
          generated_files: [
            targets.schemaResolution.generated.typePath,
            targets.schemaResolution.generated.servicePath,
            targets.schemaResolution.generated.mockPath,
          ],
          already_applied: targets.schemaResolution.alreadyApplied,
        }
      : null,
    sandbox_index: {
      fileCount: sandboxIndex.fileCount,
      frontendFiles: sandboxIndex.modules.frontend.length,
      backendFiles: sandboxIndex.modules.backend.length,
      targets: targetIndex,
    },
    risks: planRisks(requirementCard, skill),
    validation_commands: skill.validation,
    plan_mode: planMode,
    source: "rules-driven",
    ai_call: null,
  };

  if (planMode !== "llm") {
    return basePlan;
  }

  if (!modelClient?.chat) {
    throw new Error("PLAN_MODE=llm requires modelClient to be provided");
  }

  const llmResult = await planWithLlm({
    requirementCard,
    skill,
    historyRecall,
    repoPath: resolvedRepoPath,
    modelClient,
  });

  const mergedTargetFiles = Array.from(new Set([
    ...targets.targetFiles,
    ...llmResult.plan.target_files,
  ]));
  const mergedRisks = Array.from(new Set([
    ...basePlan.risks,
    ...llmResult.plan.risks,
  ]));

  return {
    ...basePlan,
    target_files: mergedTargetFiles,
    target_files_source: targets.source === "schema-driven" ? "schema-driven+llm" : "llm-driven",
    risks: mergedRisks,
    reasoning: llmResult.plan.reasoning,
    llm_impacted_modules: llmResult.plan.impacted_modules,
    source: "llm-driven",
    ai_call: llmResult.aiCall,
  };
}

function normalizePlanMode(env) {
  const mode = env.PLAN_MODE;
  if (mode === undefined || mode === "") return "rules";
  const lowered = String(mode).toLowerCase();
  if (lowered !== "rules" && lowered !== "llm") {
    throw new Error(`Unsupported PLAN_MODE: ${mode}. Use "rules" or "llm".`);
  }
  return lowered;
}

async function resolveSkillTargets(skill, repoPath) {
  if (skill.schemaChange) {
    const resolved = await resolveSchemaDrivenTargets(repoPath, skill.schemaChange);
    const assertablePaths = [
      resolved.change.modelPath,
      ...resolved.targets.frontendPaths.existing,
    ];
    return {
      targetFiles: resolved.targetFiles,
      assertablePaths,
      source: "schema-driven",
      schemaResolution: resolved,
    };
  }
  if (Array.isArray(skill.targetPaths) && skill.targetPaths.length) {
    return {
      targetFiles: skill.targetPaths,
      assertablePaths: skill.targetPaths,
      source: "skill-targets",
      schemaResolution: null,
    };
  }
  throw new Error(`Skill ${skill.id} declares neither targetPaths nor schemaChange`);
}

function requireRepoPath(repoPath, sandbox) {
  const resolvedRepoPath = repoPath || sandbox.repoPath;
  if (typeof resolvedRepoPath !== "string" || !resolvedRepoPath.trim()) {
    throw new Error("Planning Agent requires a sandbox repo path");
  }
  return resolvedRepoPath;
}

function planSummary(skill) {
  if (typeof skill.planSummary !== "string" || !skill.planSummary.trim()) {
    throw new Error(`Skill ${skill.id} must declare planSummary`);
  }
  return skill.planSummary;
}

function planRisks(requirementCard, skill) {
  const risks = [
    "Conduit 根仓没有 lint script 时由实现仓库 ESLint 检查本次改动文件",
  ];
  if (requirementCard.level === "L2") {
    risks.push("L2 跨栈改动须保持 API 字段与前端展示一致");
  } else {
    risks.push("P0 只展示前端假数据，不代表真实阅读量统计");
  }
  if (skill.schemaChange) {
    risks.push("schema-driven Skill 生成的前端类型/服务/Mock 是首版骨架，业务字段绑定需后续 Skill 或人工细化");
  }
  return risks;
}

function buildHistoryReferences(historyRecall) {
  if (!historyRecall?.matches?.length) return [];
  return historyRecall.matches.map((match) => ({
    run_id: match.runId,
    goal: match.goal,
    skill_id: match.skillId,
    score: match.score,
    summary: match.summary,
    match_type: match.matchType ?? "skill_id",
    similarity_score: typeof match.similarityScore === "number" ? match.similarityScore : null,
  }));
}

function buildImpactMatrix(requirementCard, targetFiles) {
  const frontend = targetFiles.filter((file) => file.startsWith("frontend/"));
  const backend = targetFiles.filter((file) => file.startsWith("backend/"));
  const modules = [];
  if (frontend.length) modules.push("frontend");
  if (backend.length) modules.push("backend");
  if (!modules.length) modules.push("frontend article preview", "global styles");

  return {
    level: requirementCard.level,
    modules,
    frontend_paths: frontend,
    backend_paths: backend,
    cross_stack: frontend.length > 0 && backend.length > 0,
  };
}
