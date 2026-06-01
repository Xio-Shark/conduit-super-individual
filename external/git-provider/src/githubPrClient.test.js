import assert from "node:assert/strict";
import test from "node:test";
import { createGitHubPrClient, GitHubConfigError, GitHubRequestError } from "./githubPrClient.js";

test("createGitHubPrClient rejects missing required config", () => {
  assert.throws(
    () => createGitHubPrClient({ GITHUB_TOKEN: "token" }, async () => {}),
    GitHubConfigError,
  );
});

test("createGitHubPrClient posts a draft pull request", async () => {
  const requests = [];
  const client = createGitHubPrClient({
    GITHUB_TOKEN: "token",
    GITHUB_OWNER: "owner",
    GITHUB_REPO: "repo",
    GITHUB_API_BASE_URL: "https://github.test",
	  }, async (url, options) => {
	    requests.push({ url, options });
	    return {
	      ok: true,
	      text: async () => JSON.stringify({
	        number: 7,
	        html_url: "https://github.test/owner/repo/pull/7",
	        url: "https://github.test/api/pulls/7",
	        state: "open",
	      }),
	    };
  });

  const result = await client.createPullRequest({
    title: "PR title",
    body: "PR body",
    head: "agent/run-1",
    base: "main",
  });

  assert.equal(result.number, 7);
  assert.equal(requests[0].url, "https://github.test/repos/owner/repo/pulls");
  assert.equal(requests[0].options.headers.Authorization.split(" ")[0], "Bearer");
  assert.equal(requests[0].options.headers.Authorization.split(" ")[1], "token");
  assert.equal(JSON.parse(requests[0].options.body).draft, true);
});

test("createGitHubPrClient exposes GitHub request failures", async () => {
  const client = createGitHubPrClient({
    GITHUB_TOKEN: "token",
    GITHUB_OWNER: "owner",
    GITHUB_REPO: "repo",
  }, async () => ({
    ok: false,
    status: 422,
    text: async () => JSON.stringify({ message: "Validation Failed" }),
  }));

  await assert.rejects(
    () => client.createPullRequest({ title: "t", body: "b", head: "h", base: "main" }),
    GitHubRequestError,
  );
});

test("createGitHubPrClient exposes non-json GitHub errors", async () => {
  const client = createGitHubPrClient({
    GITHUB_TOKEN: "token",
    GITHUB_OWNER: "owner",
    GITHUB_REPO: "repo",
  }, async () => ({
    ok: false,
    status: 502,
    text: async () => "Bad Gateway",
  }));

  await assert.rejects(
    () => client.createPullRequest({ title: "t", body: "b", head: "h", base: "main" }),
    /GitHub PR create failed: 502 Bad Gateway/,
  );
});

test("createGitHubPrClient rejects incomplete successful responses", async () => {
  const client = createGitHubPrClient({
    GITHUB_TOKEN: "token",
    GITHUB_OWNER: "owner",
    GITHUB_REPO: "repo",
  }, async () => ({
    ok: true,
    status: 201,
    text: async () => JSON.stringify({ number: 7, state: "open" }),
  }));

  await assert.rejects(
    () => client.createPullRequest({ title: "t", body: "b", head: "h", base: "main" }),
    /GitHub PR response missing html_url/,
  );
});
