export class GitHubConfigError extends Error {}
export class GitHubRequestError extends Error {}

const DEFAULT_BASE_URL = "https://api.github.com";

export function createGitHubPrClient(env = process.env, fetchImpl = fetch) {
  const token = required(env.GITHUB_TOKEN, "GITHUB_TOKEN");
  const owner = required(env.GITHUB_OWNER, "GITHUB_OWNER");
  const repo = required(env.GITHUB_REPO, "GITHUB_REPO");
  const baseUrl = env.GITHUB_API_BASE_URL || DEFAULT_BASE_URL;

  return {
    createPullRequest(input) {
      return createPullRequest({
        baseUrl,
        fetchImpl,
        input,
        owner,
        repo,
        token,
      });
    },
  };
}

async function createPullRequest({ baseUrl, fetchImpl, input, owner, repo, token }) {
  const body = {
    title: required(input.title, "title"),
    body: required(input.body, "body"),
    head: required(input.head, "head"),
    base: required(input.base, "base"),
    draft: input.draft !== false,
  };
  const response = await fetchImpl(`${baseUrl}/repos/${owner}/${repo}/pulls`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify(body),
  });
  const payload = parseJsonResponse(await response.text(), response.status);
  if (!response.ok) {
    throw new GitHubRequestError(
      payload.message || `GitHub PR create failed: ${response.status}`,
    );
  }

  return {
    number: requiredResponseField(payload.number, "number"),
    url: requiredResponseField(payload.html_url, "html_url"),
    apiUrl: requiredResponseField(payload.url, "url"),
    state: requiredResponseField(payload.state, "state"),
  };
}

function required(value, name) {
  if (!value) throw new GitHubConfigError(`${name} is required`);
  return value;
}

function parseJsonResponse(text, status) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new GitHubRequestError(
      `GitHub PR create failed: ${status} ${text.slice(0, 160)}`,
    );
  }
}

function requiredResponseField(value, name) {
  if (value === undefined || value === null || value === "") {
    throw new GitHubRequestError(`GitHub PR response missing ${name}`);
  }
  return value;
}
