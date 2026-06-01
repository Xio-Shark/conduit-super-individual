import assert from "node:assert/strict";
import test from "node:test";
import {
  parseAiCallLog,
  requireAiUsageMatchesSummary,
  summarizeAiCalls,
} from "./aiUsage.js";
import { buildAiCallRecords } from "./orchestrator.js";

test("parseAiCallLog reads jsonl records and summarizes usage", () => {
  const calls = parseAiCallLog([
    "{\"stage\":\"clarify\",\"tokens_in\":10,\"tokens_out\":5,\"latency_ms\":100,\"cost_estimate\":0.01}",
    "{\"stage\":\"plan\",\"tokens_in\":2,\"tokens_out\":3,\"latency_ms\":20,\"cost_estimate\":0}",
  ].join("\n"));

  assert.equal(calls.length, 2);
  assert.deepEqual(summarizeAiCalls(calls), {
    stages: 2,
    tokensIn: 12,
    tokensOut: 8,
    latencyMs: 120,
    costEstimate: 0.01,
  });
});

test("parseAiCallLog exposes invalid jsonl lines", () => {
  assert.throws(
    () => parseAiCallLog("{bad-json}\n"),
    /Invalid ai-calls\.jsonl line 1/,
  );
});

test("summarizeAiCalls rejects numeric strings", () => {
  const calls = parseAiCallLog(
    "{\"stage\":\"clarify\",\"tokens_in\":\"10\",\"tokens_out\":5,\"latency_ms\":100,\"cost_estimate\":0.01}\n",
  );

  assert.throws(
    () => summarizeAiCalls(calls),
    /tokens_in must be a finite JSON number/,
  );
});

test("requireAiUsageMatchesSummary rejects mismatched persisted usage", () => {
  assert.throws(
    () => requireAiUsageMatchesSummary(
      { stages: 1, tokensIn: 999, tokensOut: 5, latencyMs: 100, costEstimate: 0.01 },
      { stages: 1, tokensIn: 10, tokensOut: 5, latencyMs: 100, costEstimate: 0.01 },
      "run-summary.json aiUsage",
    ),
    /run-summary\.json aiUsage\.tokensIn does not match ai-calls\.jsonl/,
  );
});

test("buildAiCallRecords records only AI or rules model calls", () => {
  const calls = buildAiCallRecords({
    aiArtifacts: {
      aiCalls: [
        {
          stage: "clarify",
          model: "rules-first-p0",
          tokens_in: 0,
          tokens_out: 0,
          latency_ms: 0,
          cost_estimate: 0,
        status: "reviewed",
        prompt_version: "rules-1",
        input_summary: "input",
        output_summary: "output",
      },
      ],
    },
    plan: {
      skill_id: "article-list-display-field",
      skill_version: "1.0.0",
    },
    runId: "run-test",
  });

  assert.deepEqual(calls.map((call) => call.stage), ["clarify"]);
  assert.equal(calls[0].model, "rules-first-p0");
  assert.equal(calls[0].prompt_version, "rules-1");
  assert.equal(calls[0].input_summary, "input");
  assert.equal(calls[0].output_summary, "output");
});

test("buildAiCallRecords rejects missing AI call summaries", () => {
  assert.throws(
    () => buildAiCallRecords({
      aiArtifacts: {
        aiCalls: [
          {
            stage: "clarify",
            model: "rules-first-p0",
            prompt_version: "rules-1",
            tokens_in: 0,
            tokens_out: 0,
            latency_ms: 0,
            cost_estimate: 0,
            status: "reviewed",
          },
        ],
      },
      plan: {
        skill_id: "article-list-display-field",
        skill_version: "1.0.0",
      },
      runId: "run-test",
    }),
    /AI call input_summary is required/,
  );
});
