import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export async function createEvidenceWriter({ runId, projectRoot }) {
  if (typeof projectRoot !== "string" || projectRoot.trim() === "") {
    throw new Error("projectRoot is required for evidence writer");
  }
  const runDir = path.join(projectRoot, "docs/reports/runs", runId);
  await mkdir(runDir, { recursive: true });

  return {
    runDir,
    writeJson(name, data) {
      return writeFile(
        path.join(runDir, name),
        `${JSON.stringify(data, null, 2)}\n`,
        "utf8",
      );
    },
    writeText(name, data) {
      return writeFile(path.join(runDir, name), data, "utf8");
    },
  };
}

export function markdownFromObject(title, data) {
  return `# ${title}\n\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\`\n`;
}
