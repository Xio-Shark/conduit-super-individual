export const DEFAULT_VALIDATION = Object.freeze(["npm run lint:sandbox", "npm test"]);

export function assertIncludes(source, anchor, { filePath, skillId }) {
  if (!source.includes(anchor)) {
    throw new Error(`Skill ${skillId} missing anchor in ${filePath}: ${anchor}`);
  }
}

export function assertMatches(source, pattern, { filePath, skillId }) {
  if (!pattern.test(source)) {
    throw new Error(`Skill ${skillId} missing anchor in ${filePath}: ${pattern}`);
  }
}

export function insertBeforeAnchorOnce(source, { marker, anchor, insert, filePath, skillId }) {
  if (source.includes(marker)) {
    return source;
  }

  assertIncludes(source, anchor, { filePath, skillId });
  return source.replace(anchor, `${insert}\n${anchor}`);
}
