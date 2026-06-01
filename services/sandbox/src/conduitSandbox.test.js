import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ConduitSandbox } from "./conduitSandbox.js";

test("ConduitSandbox rejects paths that only share the repo prefix", async () => {
  const repoPath = await mkdtemp(path.join(os.tmpdir(), "conduit-sandbox-"));
  const sandbox = new ConduitSandbox(repoPath);
  const sibling = path.basename(repoPath).replace(/\/$/, "");

  assert.throws(
    () => sandbox.resolve(`../${sibling}-evil/package.json`),
    /Path escapes sandbox/,
  );
});

test("ConduitSandbox allows paths inside the repo", async () => {
  const repoPath = await mkdtemp(path.join(os.tmpdir(), "conduit-sandbox-"));
  const sandbox = new ConduitSandbox(repoPath);

  assert.equal(
    sandbox.resolve("frontend/src/App.jsx"),
    path.join(repoPath, "frontend/src/App.jsx"),
  );
});
