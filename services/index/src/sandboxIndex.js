import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx"]);

export async function buildSandboxIndex(repoPath) {
  if (!existsSync(repoPath)) {
    throw new Error(`Sandbox repo path does not exist: ${repoPath}`);
  }

  const files = [];
  await walk(repoPath, repoPath, files);

  return {
    root: repoPath,
    fileCount: files.length,
    files: files.map(({ relativePath, size }) => ({ path: relativePath, size })),
    modules: {
      frontend: files.filter((file) => file.relativePath.startsWith("frontend/")).map((file) => file.relativePath),
      backend: files.filter((file) => file.relativePath.startsWith("backend/")).map((file) => file.relativePath),
    },
  };
}

export async function readSandboxFileIndex(repoPath, targetPaths = []) {
  const snippets = [];
  for (const targetPath of targetPaths) {
    const absolutePath = path.join(repoPath, targetPath);
    if (!existsSync(absolutePath)) {
      throw new Error(`Sandbox target file does not exist: ${targetPath}`);
    }
    const source = await readFile(absolutePath, "utf8");
    snippets.push({
      path: targetPath,
      exists: true,
      exports: extractExports(source),
      imports: extractImports(source),
    });
  }
  return snippets;
}

async function walk(root, currentDir, files) {
  const entries = await readdir(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const absolutePath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      await walk(root, absolutePath, files);
      continue;
    }
    const extension = path.extname(entry.name);
    if (!SOURCE_EXTENSIONS.has(extension)) continue;
    const relativePath = path.relative(root, absolutePath).split(path.sep).join("/");
    if (!relativePath.startsWith("frontend/") && !relativePath.startsWith("backend/")) continue;
    const stat = await import("node:fs/promises").then(({ stat }) => stat(absolutePath));
    files.push({ relativePath, size: stat.size });
  }
}

function extractExports(source) {
  const exports = [];
  for (const match of source.matchAll(/export (?:default )?(?:function|class|const) (\w+)/g)) {
    exports.push(match[1]);
  }
  return exports;
}

function extractImports(source) {
  const imports = [];
  for (const match of source.matchAll(/from ["']([^"']+)["']/g)) {
    imports.push(match[1]);
  }
  return imports.slice(0, 8);
}
