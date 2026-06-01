import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  commandFailureDetail,
  countChecks,
  parseJsonSummary,
  summaryConsistencyErrors,
} from "./json-gate-summary.mjs";

const SCRIPT_PATH = fileURLToPath(new URL("json-gate-summary.mjs", import.meta.url));

test("parseJsonSummary reads the final JSON object from noisy output", () => {
  const summary = parseJsonSummary(`scan line\n${JSON.stringify({
    status: "passed",
    checks: [{ name: "gate", status: "passed" }],
  })}\n`);

  assert.equal(summary.status, "passed");
  assert.deepEqual(summary.checks, [{ name: "gate", status: "passed" }]);
});

test("summaryConsistencyErrors rejects contradictory passed summaries", () => {
  const summary = {
    status: "passed",
    checks: [{ name: "gate", status: "failed", detail: "gate failed" }],
    checkCounts: { total: 1, passed: 0, failed: 1 },
  };

  assert.deepEqual(summaryConsistencyErrors(summary), [
    "command JSON summary reports passed but has 1 failed check(s)",
  ]);
  assert.equal(
    commandFailureDetail(0, summary, summaryConsistencyErrors(summary)),
    "command JSON summary reports passed but has 1 failed check(s)",
  );
});

test("summaryConsistencyErrors rejects failed summaries without failed checks", () => {
  const summary = {
    status: "failed",
    checks: [{ name: "gate", status: "passed" }],
    checkCounts: { total: 1, passed: 1, failed: 0 },
  };

  assert.deepEqual(summaryConsistencyErrors(summary), [
    "command JSON summary reports failed but has no failed check(s)",
  ]);
  assert.equal(
    commandFailureDetail(1, summary, summaryConsistencyErrors(summary)),
    "command JSON summary reports failed but has no failed check(s)",
  );
});

test("summaryConsistencyErrors rejects summaries missing status", () => {
  const summary = {
    checks: [{ name: "gate", status: "passed" }],
  };

  assert.deepEqual(summaryConsistencyErrors(summary), [
    "command JSON summary is missing status",
  ]);
  assert.equal(
    commandFailureDetail(0, summary, summaryConsistencyErrors(summary)),
    "command JSON summary is missing status",
  );
});

test("summaryConsistencyErrors rejects summaries with invalid status", () => {
  const summary = {
    status: "maybe",
    checks: [{ name: "gate", status: "passed" }],
  };

  assert.deepEqual(summaryConsistencyErrors(summary), [
    "command JSON summary has invalid status: maybe",
  ]);
  assert.equal(
    commandFailureDetail(0, summary, summaryConsistencyErrors(summary)),
    "command JSON summary has invalid status: maybe",
  );
});

test("summaryConsistencyErrors rejects present invalid mode", () => {
  const summary = {
    mode: "",
    status: "passed",
    checks: [{ name: "gate", status: "passed" }],
  };

  assert.deepEqual(summaryConsistencyErrors(summary), [
    "command JSON summary has invalid mode: ",
  ]);
  assert.equal(
    commandFailureDetail(0, summary, summaryConsistencyErrors(summary)),
    "command JSON summary has invalid mode: ",
  );
});

test("summaryConsistencyErrors rejects checks with invalid status", () => {
  const summary = {
    status: "passed",
    checks: [{ name: "gate", status: "skipped" }],
  };

  assert.deepEqual(summaryConsistencyErrors(summary), [
    "command JSON summary has check gate with invalid status: skipped",
  ]);
  assert.equal(
    commandFailureDetail(0, summary, summaryConsistencyErrors(summary)),
    "command JSON summary has check gate with invalid status: skipped",
  );
});

test("summaryConsistencyErrors reports invalid status before later check field errors", () => {
  const summary = {
    status: "passed",
    checks: [{ name: "gate", status: "skipped", detail: "", category: "", evidence: [] }],
  };

  assert.deepEqual(summaryConsistencyErrors(summary), [
    "command JSON summary has check gate with invalid status: skipped",
  ]);
  assert.equal(
    commandFailureDetail(0, summary, summaryConsistencyErrors(summary)),
    "command JSON summary has check gate with invalid status: skipped",
  );
});

test("summaryConsistencyErrors rejects failed checks without detail", () => {
  const summary = {
    status: "failed",
    checks: [{ name: "gate", status: "failed" }],
  };

  assert.deepEqual(summaryConsistencyErrors(summary), [
    "command JSON summary has failed check gate with invalid detail: undefined",
  ]);
  assert.equal(
    commandFailureDetail(1, summary, summaryConsistencyErrors(summary)),
    "command JSON summary has failed check gate with invalid detail: undefined",
  );
});

test("summaryConsistencyErrors rejects failed checks with blank detail", () => {
  const summary = {
    status: "failed",
    checks: [{ name: "gate", status: "failed", detail: "   " }],
  };

  assert.deepEqual(summaryConsistencyErrors(summary), [
    "command JSON summary has failed check gate with invalid detail:    ",
  ]);
  assert.equal(
    commandFailureDetail(1, summary, summaryConsistencyErrors(summary)),
    "command JSON summary has failed check gate with invalid detail:    ",
  );
});

test("summaryConsistencyErrors rejects present non-string detail on any check", () => {
  const summary = {
    status: "passed",
    checks: [{ name: "gate", status: "passed", detail: [] }],
  };

  assert.deepEqual(summaryConsistencyErrors(summary), [
    "command JSON summary has check gate with invalid detail: ",
  ]);
  assert.equal(
    commandFailureDetail(0, summary, summaryConsistencyErrors(summary)),
    "command JSON summary has check gate with invalid detail: ",
  );
});

test("summaryConsistencyErrors rejects present blank detail on any check", () => {
  const summary = {
    status: "passed",
    checks: [{ name: "gate", status: "passed", detail: "   " }],
  };

  assert.deepEqual(summaryConsistencyErrors(summary), [
    "command JSON summary has check gate with invalid detail:    ",
  ]);
  assert.equal(
    commandFailureDetail(0, summary, summaryConsistencyErrors(summary)),
    "command JSON summary has check gate with invalid detail:    ",
  );
});

test("summaryConsistencyErrors rejects empty checks", () => {
  const summary = {
    status: "passed",
    checks: [],
    checkCounts: { total: 0, passed: 0, failed: 0 },
  };

  assert.deepEqual(summaryConsistencyErrors(summary), [
    "command JSON summary has empty checks[]",
  ]);
  assert.equal(
    commandFailureDetail(0, summary, summaryConsistencyErrors(summary)),
    "command JSON summary has empty checks[]",
  );
});

test("summaryConsistencyErrors rejects non-object checks", () => {
  const summary = {
    status: "passed",
    checks: [null],
  };

  assert.deepEqual(summaryConsistencyErrors(summary), [
    "command JSON summary has non-object check at index 0",
  ]);
  assert.equal(
    commandFailureDetail(0, summary, summaryConsistencyErrors(summary)),
    "command JSON summary has non-object check at index 0",
  );
});

test("summaryConsistencyErrors rejects checks with invalid names", () => {
  const summary = {
    status: "passed",
    checks: [{ name: "", status: "passed" }],
  };

  assert.deepEqual(summaryConsistencyErrors(summary), [
    "command JSON summary has check with invalid name: ",
  ]);
  assert.equal(
    commandFailureDetail(0, summary, summaryConsistencyErrors(summary)),
    "command JSON summary has check with invalid name: ",
  );
});

test("summaryConsistencyErrors rejects checks with non-string names", () => {
  const summary = {
    status: "passed",
    checks: [{ name: 7, status: "passed" }],
  };

  assert.deepEqual(summaryConsistencyErrors(summary), [
    "command JSON summary has check with invalid name: 7",
  ]);
  assert.equal(
    commandFailureDetail(0, summary, summaryConsistencyErrors(summary)),
    "command JSON summary has check with invalid name: 7",
  );
});

test("summaryConsistencyErrors rejects mismatched check counts", () => {
  const checks = [{ name: "gate", status: "passed" }];
  assert.deepEqual(countChecks(checks), { total: 1, passed: 1, failed: 0 });
  assert.deepEqual(summaryConsistencyErrors({
    status: "passed",
    checks,
    checkCounts: { total: 2, passed: 1, failed: 0 },
  }), [
    "command JSON summary checkCounts.total=2 does not match checks[] total=1",
  ]);
});

test("summaryConsistencyErrors rejects non-object check counts", () => {
  const summary = {
    status: "passed",
    checks: [{ name: "gate", status: "passed" }],
    checkCounts: null,
  };

  assert.deepEqual(summaryConsistencyErrors(summary), [
    "command JSON summary checkCounts must be an object",
  ]);
  assert.equal(
    commandFailureDetail(0, summary, summaryConsistencyErrors(summary)),
    "command JSON summary checkCounts must be an object",
  );
});

test("summaryConsistencyErrors rejects non-integer check counts", () => {
  const summary = {
    status: "passed",
    checks: [{ name: "gate", status: "passed" }],
    checkCounts: { total: "1", passed: 1, failed: 0 },
  };

  assert.deepEqual(summaryConsistencyErrors(summary), [
    "command JSON summary checkCounts.total must be a non-negative integer",
  ]);
  assert.equal(
    commandFailureDetail(0, summary, summaryConsistencyErrors(summary)),
    "command JSON summary checkCounts.total must be a non-negative integer",
  );
});

test("summaryConsistencyErrors rejects negative check counts", () => {
  const summary = {
    status: "passed",
    checks: [{ name: "gate", status: "passed" }],
    checkCounts: { total: 1, passed: -1, failed: 0 },
  };

  assert.deepEqual(summaryConsistencyErrors(summary), [
    "command JSON summary checkCounts.passed must be a non-negative integer",
  ]);
  assert.equal(
    commandFailureDetail(0, summary, summaryConsistencyErrors(summary)),
    "command JSON summary checkCounts.passed must be a non-negative integer",
  );
});

test("summaryConsistencyErrors rejects non-object categories", () => {
  const summary = {
    status: "passed",
    checks: [{ name: "gate", status: "passed" }],
    categories: null,
  };

  assert.deepEqual(summaryConsistencyErrors(summary), [
    "command JSON summary categories must be an object",
  ]);
  assert.equal(
    commandFailureDetail(0, summary, summaryConsistencyErrors(summary)),
    "command JSON summary categories must be an object",
  );
});

test("summaryConsistencyErrors rejects invalid category counts", () => {
  const summary = {
    status: "failed",
    checks: [{ name: "gate", status: "failed", detail: "gate failed", category: "video" }],
    categories: { video: { total: 1, failed: "1" } },
  };

  assert.deepEqual(summaryConsistencyErrors(summary), [
    "command JSON summary categories.video.failed must be a non-negative integer",
  ]);
  assert.equal(
    commandFailureDetail(1, summary, summaryConsistencyErrors(summary)),
    "command JSON summary categories.video.failed must be a non-negative integer",
  );
});

test("summaryConsistencyErrors rejects category failed counts above total", () => {
  const summary = {
    status: "failed",
    checks: [
      { name: "gate", status: "failed", detail: "gate failed", category: "video" },
      { name: "gate-2", status: "failed", detail: "gate 2 failed", category: "video" },
    ],
    categories: { video: { total: 1, failed: 2 } },
  };

  assert.deepEqual(summaryConsistencyErrors(summary), [
    "command JSON summary categories.video.failed=2 exceeds total=1",
  ]);
  assert.equal(
    commandFailureDetail(1, summary, summaryConsistencyErrors(summary)),
    "command JSON summary categories.video.failed=2 exceeds total=1",
  );
});

test("summaryConsistencyErrors rejects category counts that do not match checks", () => {
  const summary = {
    status: "failed",
    checks: [{ name: "gate", status: "failed", detail: "gate failed", category: "public-repo" }],
    categories: { "public-repo": { total: 2, failed: 1 } },
  };

  assert.deepEqual(summaryConsistencyErrors(summary), [
    "command JSON summary categories.public-repo.total=2 does not match checks[] category total=1",
  ]);
  assert.equal(
    commandFailureDetail(1, summary, summaryConsistencyErrors(summary)),
    "command JSON summary categories.public-repo.total=2 does not match checks[] category total=1",
  );
});

test("summaryConsistencyErrors rejects checks categories missing from categories", () => {
  const summary = {
    status: "failed",
    checks: [{ name: "gate", status: "failed", detail: "gate failed", category: "public-repo" }],
    categories: {},
  };

  assert.deepEqual(summaryConsistencyErrors(summary), [
    "command JSON summary categories is missing category public-repo from checks[]",
  ]);
  assert.equal(
    commandFailureDetail(1, summary, summaryConsistencyErrors(summary)),
    "command JSON summary categories is missing category public-repo from checks[]",
  );
});

test("summaryConsistencyErrors rejects categories without matching checks", () => {
  const summary = {
    status: "failed",
    checks: [{ name: "gate", status: "failed", detail: "gate failed", category: "public-repo" }],
    categories: {
      "public-repo": { total: 1, failed: 1 },
      video: { total: 0, failed: 0 },
    },
  };

  assert.deepEqual(summaryConsistencyErrors(summary), [
    "command JSON summary categories.video has no matching checks[] category",
  ]);
  assert.equal(
    commandFailureDetail(1, summary, summaryConsistencyErrors(summary)),
    "command JSON summary categories.video has no matching checks[] category",
  );
});

test("summaryConsistencyErrors rejects non-string check categories", () => {
  const summary = {
    status: "failed",
    checks: [{ name: "gate", status: "failed", detail: "gate failed", category: ["public-repo"] }],
    categories: { "public-repo": { total: 1, failed: 1 } },
  };

  assert.deepEqual(summaryConsistencyErrors(summary), [
    "command JSON summary has check gate with invalid category: public-repo",
  ]);
  assert.equal(
    commandFailureDetail(1, summary, summaryConsistencyErrors(summary)),
    "command JSON summary has check gate with invalid category: public-repo",
  );
});

test("summaryConsistencyErrors rejects blank check categories", () => {
  const summary = {
    status: "failed",
    checks: [{ name: "gate", status: "failed", detail: "gate failed", category: "   " }],
    categories: { "   ": { total: 1, failed: 1 } },
  };

  assert.deepEqual(summaryConsistencyErrors(summary), [
    "command JSON summary has check gate with invalid category:    ",
  ]);
  assert.equal(
    commandFailureDetail(1, summary, summaryConsistencyErrors(summary)),
    "command JSON summary has check gate with invalid category:    ",
  );
});

test("summaryConsistencyErrors rejects check categories without top-level categories", () => {
  const summary = {
    status: "failed",
    checks: [{ name: "gate", status: "failed", detail: "gate failed", category: "public-repo" }],
  };

  assert.deepEqual(summaryConsistencyErrors(summary), [
    "command JSON summary is missing categories for checks[] categories",
  ]);
  assert.equal(
    commandFailureDetail(1, summary, summaryConsistencyErrors(summary)),
    "command JSON summary is missing categories for checks[] categories",
  );
});

test("summaryConsistencyErrors rejects checks with non-array evidence", () => {
  const summary = {
    status: "failed",
    checks: [{ name: "gate", status: "failed", detail: "gate failed", evidence: "not an array" }],
  };

  assert.deepEqual(summaryConsistencyErrors(summary), [
    "command JSON summary has check gate with non-array evidence",
  ]);
  assert.equal(
    commandFailureDetail(1, summary, summaryConsistencyErrors(summary)),
    "command JSON summary has check gate with non-array evidence",
  );
});

test("summaryConsistencyErrors rejects checks with empty evidence arrays", () => {
  const summary = {
    status: "failed",
    checks: [{ name: "gate", status: "failed", detail: "gate failed", evidence: [] }],
  };

  assert.deepEqual(summaryConsistencyErrors(summary), [
    "command JSON summary has check gate with empty evidence[]",
  ]);
  assert.equal(
    commandFailureDetail(1, summary, summaryConsistencyErrors(summary)),
    "command JSON summary has check gate with empty evidence[]",
  );
});

test("summaryConsistencyErrors rejects checks with blank evidence items", () => {
  const summary = {
    status: "failed",
    checks: [{ name: "gate", status: "failed", detail: "gate failed", evidence: ["ok", ""] }],
  };

  assert.deepEqual(summaryConsistencyErrors(summary), [
    "command JSON summary has check gate with invalid evidence at index 1: ",
  ]);
  assert.equal(
    commandFailureDetail(1, summary, summaryConsistencyErrors(summary)),
    "command JSON summary has check gate with invalid evidence at index 1: ",
  );
});

test("summaryConsistencyErrors rejects checks with non-string evidence items", () => {
  const summary = {
    status: "failed",
    checks: [{ name: "gate", status: "failed", detail: "gate failed", evidence: ["ok", 7] }],
  };

  assert.deepEqual(summaryConsistencyErrors(summary), [
    "command JSON summary has check gate with invalid evidence at index 1: 7",
  ]);
  assert.equal(
    commandFailureDetail(1, summary, summaryConsistencyErrors(summary)),
    "command JSON summary has check gate with invalid evidence at index 1: 7",
  );
});

test("json gate CLI rejects passed summaries with failed checks", async () => {
  const result = await runHelperCli({
    status: "passed",
    checks: [{ name: "gate", status: "failed", detail: "gate failed" }],
    checkCounts: { total: 1, passed: 0, failed: 1 },
  });

  assert.equal(result.code, 1);
  assert.match(result.stdout, /JSON gate summary reports passed but has 1 failed check\(s\)/);
});

test("json gate CLI rejects failed summaries with failed checks without claiming passed", async () => {
  const result = await runHelperCli({
    status: "failed",
    checks: [{ name: "gate", status: "failed", detail: "gate failed" }],
    checkCounts: { total: 1, passed: 0, failed: 1 },
  });

  assert.equal(result.code, 1);
  assert.match(result.stdout, /JSON gate reported status=failed with 1 failed check/);
  assert.doesNotMatch(result.stdout, /status=passed/);
});

test("json gate CLI rejects failed summaries without failed checks", async () => {
  const result = await runHelperCli({
    status: "failed",
    checks: [{ name: "gate", status: "passed" }],
    checkCounts: { total: 1, passed: 1, failed: 0 },
  });

  assert.equal(result.code, 1);
  assert.match(result.stdout, /JSON gate summary reports failed but has no failed check\(s\)/);
});

test("json gate CLI rejects summaries missing status", async () => {
  const result = await runHelperCli({
    checks: [{ name: "gate", status: "passed" }],
  });

  assert.equal(result.code, 1);
  assert.match(result.stdout, /JSON gate summary is missing status/);
});

test("json gate CLI rejects present invalid mode", async () => {
  const result = await runHelperCli({
    mode: "",
    status: "passed",
    checks: [{ name: "gate", status: "passed" }],
  });

  assert.equal(result.code, 1);
  assert.match(result.stdout, /JSON gate summary has invalid mode:/);
});

test("json gate CLI rejects checks with invalid status", async () => {
  const result = await runHelperCli({
    status: "passed",
    checks: [{ name: "gate", status: "skipped" }],
  });

  assert.equal(result.code, 1);
  assert.match(result.stdout, /JSON gate summary has check gate with invalid status: skipped/);
});

test("json gate CLI reports invalid status before later check field errors", async () => {
  const result = await runHelperCli({
    status: "passed",
    checks: [{ name: "gate", status: "skipped", detail: "", category: "", evidence: [] }],
  });

  assert.equal(result.code, 1);
  assert.match(result.stdout, /JSON gate summary has check gate with invalid status: skipped/);
  assert.doesNotMatch(result.stdout, /invalid detail|invalid category|empty evidence/);
});

test("json gate CLI rejects failed checks without detail", async () => {
  const result = await runHelperCli({
    status: "failed",
    checks: [{ name: "gate", status: "failed" }],
  });

  assert.equal(result.code, 1);
  assert.match(result.stdout, /JSON gate summary has failed check gate with invalid detail: undefined/);
});

test("json gate CLI rejects present invalid detail on passed checks", async () => {
  const result = await runHelperCli({
    status: "passed",
    checks: [{ name: "gate", status: "passed", detail: "" }],
  });

  assert.equal(result.code, 1);
  assert.match(result.stdout, /JSON gate summary has check gate with invalid detail:/);
});

test("json gate CLI rejects empty checks", async () => {
  const result = await runHelperCli({
    status: "passed",
    checks: [],
    checkCounts: { total: 0, passed: 0, failed: 0 },
  });

  assert.equal(result.code, 1);
  assert.match(result.stdout, /JSON gate summary has empty checks\[\]/);
});

test("json gate CLI rejects non-object checks", async () => {
  const result = await runHelperCli({
    status: "passed",
    checks: [null],
  });

  assert.equal(result.code, 1);
  assert.match(result.stdout, /JSON gate summary has non-object check at index 0/);
});

test("json gate CLI rejects invalid check names", async () => {
  const result = await runHelperCli({
    status: "passed",
    checks: [{ name: null, status: "passed" }],
  });

  assert.equal(result.code, 1);
  assert.match(result.stdout, /JSON gate summary has check with invalid name: null/);
});

test("json gate CLI rejects malformed check counts", async () => {
  const result = await runHelperCli({
    status: "passed",
    checks: [{ name: "gate", status: "passed" }],
    checkCounts: [],
  });

  assert.equal(result.code, 1);
  assert.match(result.stdout, /JSON gate checkCounts must be an object/);
});

test("json gate CLI rejects invalid check count values", async () => {
  const result = await runHelperCli({
    status: "passed",
    checks: [{ name: "gate", status: "passed" }],
    checkCounts: { total: 1, passed: 1, failed: -1 },
  });

  assert.equal(result.code, 1);
  assert.match(result.stdout, /JSON gate checkCounts\.failed must be a non-negative integer/);
});

test("json gate CLI rejects malformed categories", async () => {
  const result = await runHelperCli({
    status: "failed",
    checks: [{ name: "gate", status: "failed", detail: "gate failed", category: "video" }],
    categories: { video: { total: "1", failed: 1 } },
  });

  assert.equal(result.code, 1);
  assert.match(result.stdout, /JSON gate summary categories\.video\.total must be a non-negative integer/);
});

test("json gate CLI rejects category counts that do not match checks", async () => {
  const result = await runHelperCli({
    status: "failed",
    checks: [{ name: "gate", status: "failed", detail: "gate failed", category: "public-repo" }],
    categories: { "public-repo": { total: 2, failed: 1 } },
  });

  assert.equal(result.code, 1);
  assert.match(result.stdout, /JSON gate summary categories\.public-repo\.total=2 does not match checks\[\] category total=1/);
});

test("json gate CLI rejects checks categories missing from categories", async () => {
  const result = await runHelperCli({
    status: "failed",
    checks: [{ name: "gate", status: "failed", detail: "gate failed", category: "public-repo" }],
    categories: {},
  });

  assert.equal(result.code, 1);
  assert.match(result.stdout, /JSON gate summary categories is missing category public-repo from checks\[\]/);
});

test("json gate CLI rejects categories without matching checks", async () => {
  const result = await runHelperCli({
    status: "failed",
    checks: [{ name: "gate", status: "failed", detail: "gate failed", category: "public-repo" }],
    categories: {
      "public-repo": { total: 1, failed: 1 },
      video: { total: 0, failed: 0 },
    },
  });

  assert.equal(result.code, 1);
  assert.match(result.stdout, /JSON gate summary categories\.video has no matching checks\[\] category/);
});

test("json gate CLI rejects invalid check categories", async () => {
  const result = await runHelperCli({
    status: "failed",
    checks: [{ name: "gate", status: "failed", detail: "gate failed", category: { name: "public-repo" } }],
    categories: { "public-repo": { total: 1, failed: 1 } },
  });

  assert.equal(result.code, 1);
  assert.match(result.stdout, /JSON gate summary has check gate with invalid category: \[object Object\]/);
});

test("json gate CLI rejects check categories without categories", async () => {
  const result = await runHelperCli({
    status: "failed",
    checks: [{ name: "gate", status: "failed", detail: "gate failed", category: "public-repo" }],
  });

  assert.equal(result.code, 1);
  assert.match(result.stdout, /JSON gate summary is missing categories for checks\[\] categories/);
});

test("json gate CLI rejects invalid check evidence", async () => {
  const result = await runHelperCli({
    status: "failed",
    checks: [{ name: "gate", status: "failed", detail: "gate failed", evidence: ["ok", 7] }],
  });

  assert.equal(result.code, 1);
  assert.match(result.stdout, /JSON gate summary has check gate with invalid evidence at index 1: 7/);
});

test("json gate CLI rejects empty check evidence", async () => {
  const result = await runHelperCli({
    status: "failed",
    checks: [{ name: "gate", status: "failed", detail: "gate failed", evidence: [] }],
  });

  assert.equal(result.code, 1);
  assert.match(result.stdout, /JSON gate summary has check gate with empty evidence\[\]/);
});

test("json gate CLI reports protocol errors before ordinary failed checks", async () => {
  const result = await runHelperCli({
    status: "failed",
    checks: [
      { name: "gate", status: "failed", detail: "gate failed" },
      { name: "optional", status: "skipped" },
    ],
  });

  assert.equal(result.code, 1);
  assert.match(result.stdout, /JSON gate summary has check optional with invalid status: skipped/);
  assert.doesNotMatch(result.stdout, /with 1 failed check/);
});

function runHelperCli(summary) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SCRIPT_PATH]);
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
    child.stdin.end(JSON.stringify(summary));
  });
}
