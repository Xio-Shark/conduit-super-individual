export async function applyCodingPlan({ sandbox, skill }) {
  return skill.apply(sandbox);
}
