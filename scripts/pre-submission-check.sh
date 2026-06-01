#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
GIT_PREFIX="$(git rev-parse --show-prefix 2>/dev/null || true)"

failures=()
FAILURE_SEPARATOR=$'\037'

add_failure() {
  local category="$1"
  local detail="$2"
  local evidence="${3:-}"
  failures+=("${category}${FAILURE_SEPARATOR}${detail}${FAILURE_SEPARATOR}${evidence}")
}

fail_with_summary() {
  printf 'FAIL: pre-submission check found %d blocker(s):\n' "${#failures[@]}"
  for failure in "${failures[@]}"; do
    IFS="$FAILURE_SEPARATOR" read -r category detail evidence <<< "$failure"
    printf '  - [%s] %s\n' "$category" "$detail"
  done
  print_summary "failed" "${failures[@]}"
  exit 1
}

run_json_gate() {
  local output
  local exit_code
  set +e
  output="$("$@" 2>&1)"
  exit_code=$?
  set -e
  printf '%s\n' "$output"
  printf '%s\n' "$output" | node scripts/json-gate-summary.mjs
  local summary_exit_code=$?
  if ((exit_code != 0 || summary_exit_code != 0)); then
    return 1
  fi
}

print_summary() {
  local status="$1"
  shift
  SUMMARY_STATUS="$status" node --input-type=module - "$@" <<'NODE'
const failures = process.argv.slice(2);
const status = process.env.SUMMARY_STATUS;
const parsedFailures = failures.map((failure) => {
  const separator = "\x1F";
  const firstSeparator = failure.indexOf(separator);
  if (firstSeparator === -1) return { category: "pre-submission", detail: failure };
  const secondSeparator = failure.indexOf(separator, firstSeparator + 1);
  if (secondSeparator === -1) {
    return {
      category: failure.slice(0, firstSeparator),
      detail: failure.slice(firstSeparator + 1),
    };
  }
  const evidence = failure.slice(secondSeparator + 1)
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  return {
    category: failure.slice(0, firstSeparator),
    detail: failure.slice(firstSeparator + 1, secondSeparator),
    evidence: evidence.length ? evidence : undefined,
  };
});
const categories = parsedFailures.reduce((items, failure) => {
  const current = items[failure.category] ?? { total: 0, failed: 0 };
  current.total += 1;
  current.failed += 1;
  items[failure.category] = current;
  return items;
}, {});
const summary = {
  mode: "pre-submission-check",
  status,
  blockerCount: parsedFailures.length,
  categories,
  checks: parsedFailures.length
    ? parsedFailures.map((failure) => ({
      name: failure.category,
      status: "failed",
      detail: failure.detail,
      category: failure.category,
      evidence: failure.evidence,
    }))
    : [{ name: "pre-submission", status: "passed", detail: "local checks and verify passed" }],
  note: "This checks local readiness only; public repository URL, Demo URL, video URL, team information, and final external submission still require human/remote verification.",
};
summary.checkCounts = {
  total: summary.checks.length,
  passed: summary.checks.filter((check) => check.status === "passed").length,
  failed: summary.checks.filter((check) => check.status === "failed").length,
};
console.log(JSON.stringify(summary, null, 2));
NODE
}

echo "== Pre-submission security check =="

if git status --porcelain 2>/dev/null | rg -q '^[^?].*\.env$|^\?\? .*\.env$'; then
  echo "FAIL: .env appears in git status"
  add_failure "security" ".env appears in git status"
fi

key_hits="$(rg -n 'sk-[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{20,}' --glob '!node_modules' --glob '!.env' . 2>/dev/null || true)"
if [[ -n "$key_hits" ]]; then
  printf '%s\n' "$key_hits"
  echo "FAIL: possible API key pattern in tracked files"
  add_failure "security" "possible API key pattern in tracked files"
fi

echo "== Pre-submission readiness check =="

echo "== Candidate archive dry-run =="
if ! run_json_gate npm run archive:dry-run; then
  echo "FAIL: archive dry-run failed"
  add_failure "archive" "archive dry-run failed"
fi

required_public_paths=()
while IFS= read -r path; do
  required_public_paths+=("$path")
done < <(node --input-type=module - <<'NODE'
import manifest from "./scripts/archive-manifest.json" with { type: "json" };

const required = [
  ...manifest.required,
  ...manifest.runIds.flatMap((runId) =>
    manifest.requiredRunFiles.map((file) => `docs/reports/runs/${runId}/${file}`),
  ),
];
for (const path of required) {
  console.log(path);
}
NODE
)

missing_public_paths=()
for path in "${required_public_paths[@]}"; do
  if ! git ls-files --error-unmatch "$path" >/dev/null 2>&1; then
    missing_public_paths+=("$path")
  fi
done

if ((${#missing_public_paths[@]} > 0)); then
  printf 'Missing tracked public release paths:\n'
  printf '  - %s\n' "${missing_public_paths[@]}"
  echo "FAIL: public release paths are not all tracked by git"
  add_failure "git-tracking" "public release paths are not all tracked by git" "$(printf '%s\n' "${missing_public_paths[@]}")"
fi

critical_untracked_paths="$(git status --porcelain 2>/dev/null \
  | sed "s#^?? ${GIT_PREFIX}#?? #" \
  | rg '^\?\? (apps/|services/|scripts/|e2e/|docs/reports/submission/|docs/reports/runs/|sandbox-repo/|playwright\.config\.js$)' \
  || true)"
if [[ -n "$critical_untracked_paths" ]]; then
  printf 'Critical release paths still untracked:\n'
  printf '%s\n' "$critical_untracked_paths"
  echo "FAIL: critical release paths are not ready for a tracked public repository"
  add_failure "git-tracking" "critical release paths are not ready for a tracked public repository" "$critical_untracked_paths"
fi

placeholder_hits="$(rg -n '待填|待部署|待录制|待发布|待人工|TODO|TBD|placeholder|REPLACE_WITH|example\.(com|net|org|invalid)|/example(/|$)' docs/reports/submission/checklist.md docs/reports/submission/public-repo-guide.md || true)"
if [[ -n "$placeholder_hits" ]]; then
  printf '%s\n' "$placeholder_hits"
  echo "FAIL: submission materials still contain human-pending placeholders"
  add_failure "submission-materials" "submission materials still contain human-pending placeholders" "$placeholder_hits"
fi

submission_hits="$(rg -n '^- \[ \] 6\.10 前对外提交|远端公开 URL \| _' docs/reports/submission/checklist.md docs/reports/submission/public-repo-guide.md || true)"
if [[ -n "$submission_hits" ]]; then
  printf '%s\n' "$submission_hits"
  echo "FAIL: final external submission checklist is not complete"
  add_failure "submission-materials" "final external submission checklist is not complete" "$submission_hits"
fi

echo "== U6 timed rehearsal evidence check =="
if ! run_json_gate npm run check:u6 -- --manifest docs/reports/submission/u6-rehearsal-manifest.json; then
  echo "FAIL: U6 timed rehearsal evidence is missing or incomplete"
  add_failure "u6-evidence" "U6 timed rehearsal evidence is missing or incomplete"
fi

echo "== Local video evidence check =="
if ! run_json_gate npm run check:video-evidence -- --file docs/reports/submission/video-evidence.json; then
  echo "FAIL: local video evidence is missing or incomplete"
  add_failure "video-evidence" "local video evidence is missing or incomplete"
fi

echo "== Defense rehearsal evidence check =="
if ! run_json_gate npm run check:defense-rehearsal -- --file docs/reports/submission/defense-rehearsal-evidence.json; then
  echo "FAIL: defense rehearsal evidence is missing or incomplete"
  add_failure "defense-evidence" "defense rehearsal evidence is missing or incomplete"
fi

echo "== External submission evidence check =="
if [[ -z "${PUBLIC_REPO_CLONE_PATH:-}" ]]; then
  echo "FAIL: PUBLIC_REPO_CLONE_PATH is required before checking external submission evidence"
  add_failure "external-evidence" "public repository fresh clone path is missing for external submission evidence"
elif ! run_json_gate npm run check:external-submission -- --public-repo "$PUBLIC_REPO_CLONE_PATH"; then
  echo "FAIL: external submission evidence is missing or incomplete"
  add_failure "external-evidence" "external submission evidence is missing or incomplete"
fi

echo "== Public repository fresh clone check =="
if [[ -z "${PUBLIC_REPO_CLONE_PATH:-}" ]]; then
  echo "FAIL: PUBLIC_REPO_CLONE_PATH is required for the public repository fresh clone check"
  add_failure "public-repo" "public repository fresh clone path is missing"
else
  if ! run_json_gate npm run check:public-repo -- --repo "$PUBLIC_REPO_CLONE_PATH"; then
    echo "FAIL: public repository fresh clone check failed"
    add_failure "public-repo" "public repository fresh clone check failed"
  fi
fi

if ((${#failures[@]} > 0)); then
  fail_with_summary
fi

echo "Running npm run verify..."
if ! npm run verify; then
  echo "FAIL: npm run verify failed"
  add_failure "verify" "npm run verify failed"
  fail_with_summary
fi

echo "OK: local pre-submission checks, verify, and key-pattern scans passed"
echo "NOTE: public repository URL, Demo URL, video URL, and team information still require human/remote verification."
print_summary "passed"
