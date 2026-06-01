import { execFile } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const COMMAND_TIMEOUT_MS = 60_000;

export class ConduitSandbox {
  constructor(repoPath) {
    this.repoPath = path.resolve(repoPath);
  }

  resolve(relativePath) {
    const target = path.resolve(this.repoPath, relativePath);
    const relative = path.relative(this.repoPath, target);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(`Path escapes sandbox: ${relativePath}`);
    }
    return target;
  }

  async assertConduitOrigin() {
    const result = await this.runGit(["remote", "get-url", "origin"]);
    if (!result.stdout.includes("conduit-realworld-example-app")) {
      throw new Error("sandbox-repo origin is not Conduit");
    }
    return result.stdout.trim();
  }

  async assertFiles(paths) {
    await Promise.all(paths.map((filePath) => stat(this.resolve(filePath))));
  }

  async readText(relativePath) {
    return readFile(this.resolve(relativePath), "utf8");
  }

  async writeText(relativePath, content) {
    const filePath = this.resolve(relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content, "utf8");
  }

  async gitDiff() {
    await this.runGit(["add", "-N", "."]);
    const result = await this.runGit(["diff", "--", "."]);
    return result.stdout;
  }

  async runNpmScript(scriptName) {
    return this.runCommand("npm", ["run", scriptName], this.repoPath);
  }

  async listPackageScripts() {
    const text = await this.readText("package.json");
    const scripts = JSON.parse(text).scripts;
    if (!scripts || typeof scripts !== "object" || Array.isArray(scripts)) {
      throw new Error("Conduit package.json scripts must be an object");
    }
    return scripts;
  }

  async runGit(args) {
    return this.runCommand("git", args, this.repoPath);
  }

  async runCommand(command, args, cwd = this.repoPath) {
    const startedAt = Date.now();
    try {
      const output = await execFileAsync(command, args, {
        cwd,
        timeout: COMMAND_TIMEOUT_MS,
      });
      return buildCommandResult(command, args, output, 0, startedAt);
    } catch (error) {
      return buildCommandResult(command, args, error, requireExitCode(error), startedAt);
    }
  }
}

function buildCommandResult(command, args, output, exitCode, startedAt) {
  const stdout = requireCommandOutputText(output.stdout, "stdout");
  const stderr = requireCommandOutputText(output.stderr, "stderr");
  return {
    command: [command, ...args].join(" "),
    exitCode,
    stdout,
    stderr,
    durationMs: Date.now() - startedAt,
  };
}

function requireCommandOutputText(value, name) {
  if (value === undefined) {
    throw new Error(`Command result missing ${name}`);
  }
  if (typeof value !== "string") {
    throw new Error(`Command result ${name} must be a string`);
  }
  return value;
}

function requireExitCode(error) {
  if (Number.isInteger(error.code)) {
    return error.code;
  }
  if (error.signal) {
    throw new Error(`Command terminated by signal ${error.signal}`);
  }
  throw new Error("Command failed without numeric exit code");
}
