import { DEFAULT_VALIDATION, assertIncludes, insertBeforeAnchorOnce } from "./skillHelpers.js";

const SKILL_ID = "profile-account-age";
const PROFILE_PATH = "frontend/src/routes/Profile/Profile.jsx";
const STYLE_PATH = "frontend/src/styles.css";

export const profileAccountAgeSkill = Object.freeze({
  id: SKILL_ID,
  version: "1.0.0",
  intent: "在 Profile 页面展示注册天数提示",
  planSummary: "在 Profile 页面用户信息区域展示本地估算的注册天数提示。",
  appliesWhen: ["作者资料卡", "注册天数", "profile account age", "account age"],
  intentWeights: {
    作者资料卡: 4,
    注册天数: 4,
    "profile account age": 4,
  },
  targetPaths: [PROFILE_PATH, STYLE_PATH],
  validation: DEFAULT_VALIDATION,
});

export async function applyProfileAccountAge(sandbox) {
  const profile = await sandbox.readText(PROFILE_PATH);
  const styles = await sandbox.readText(STYLE_PATH);

  await sandbox.writeText(PROFILE_PATH, updateProfile(profile));
  await sandbox.writeText(STYLE_PATH, updateStyles(styles));

  return {
    changedFiles: profileAccountAgeSkill.targetPaths,
    summary: "Profile page now shows a local account age signal in the user card.",
  };
}

function updateProfile(source) {
  if (source.includes("profile-account-age")) return source;

  const componentAnchor = "function Profile() {";
  const authorAnchor = "          <AuthorInfo />\n";
  assertIncludes(source, componentAnchor, { filePath: PROFILE_PATH, skillId: SKILL_ID });
  assertIncludes(source, authorAnchor, { filePath: PROFILE_PATH, skillId: SKILL_ID });

  return source
    .replace(componentAnchor, `${buildHelper()}\n${componentAnchor}`)
    .replace(
      authorAnchor,
      `${authorAnchor}          <p className="profile-account-age">
            Member for {getProfileAccountAgeDays(state)} days
          </p>
`,
    );
}

function buildHelper() {
  return `function getProfileAccountAgeDays(state) {
  const createdAt = state?.createdAt ?? state?.author?.createdAt;
  if (!createdAt) return 30;
  const joinedAt = new Date(createdAt).getTime();
  if (Number.isNaN(joinedAt)) return 30;
  return Math.max(1, Math.ceil((Date.now() - joinedAt) / 86400000));
}`;
}

function updateStyles(source) {
  return insertBeforeAnchorOnce(source, {
    marker: ".profile-account-age",
    anchor: ".profile-page .user-info p {",
    insert: `.profile-account-age {
  margin-top: 0.5rem;
  color: var(--text-light);
  font-size: 0.85rem;
}`,
    filePath: STYLE_PATH,
    skillId: SKILL_ID,
  });
}
