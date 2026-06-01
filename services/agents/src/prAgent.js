export function buildPrDraft({ diff, plan, requirementCard, verification }) {
  const files = parseChangedFiles(diff).map((file) => `- ${file}`).join("\n");
  const tests = verification.checks.map(formatCheck).join("\n");
  const risks = formatRisks(plan.risks);

  return `# PR Draft: ${requirementCard.goal}

## Requirement
${requirementCard.source_input}

## Plan
${plan.summary}

## Files Changed
${files}

## Verification
${tests}

## Risks
${risks}

## Rollback
Revert the generated patch or discard the branch before submitting PR.

## Diff Summary
${summarizeDiff(diff)}
`;
}

function formatCheck(check) {
  return `- ${check.command}: exit ${check.exitCode}`;
}

function formatRisks(risks) {
  if (!Array.isArray(risks) || risks.length === 0) {
    throw new Error("PR draft requires plan.risks");
  }
  return risks.map((risk) => `- ${risk}`).join("\n");
}

function summarizeDiff(diff) {
  return diff
    .split("\n")
    .filter((line) => line.startsWith("diff --git"))
    .join("\n");
}

function parseChangedFiles(diff) {
  return diff
    .split("\n")
    .filter((line) => line.startsWith("diff --git"))
    .map((line) => line.split(" b/")[1])
    .filter(Boolean);
}
