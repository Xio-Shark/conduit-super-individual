import { DEFAULT_VALIDATION, assertIncludes, insertBeforeAnchorOnce } from "./skillHelpers.js";

const SKILL_ID = "comment-draft-counter";
const COMMENT_EDITOR_PATH = "frontend/src/components/CommentEditor/CommentEditor.jsx";
const STYLE_PATH = "frontend/src/styles.css";
const COMMENT_LIMIT = 280;

export const commentDraftCounterSkill = Object.freeze({
  id: SKILL_ID,
  version: "1.0.0",
  intent: "在评论输入框下方展示 280 字倒计数",
  planSummary: "在 CommentEditor 中展示评论草稿剩余字数，不修改后端。",
  appliesWhen: ["评论输入框", "字数倒计数", "comment draft counter", "280"],
  intentWeights: {
    评论输入框: 4,
    字数倒计数: 4,
    "comment draft counter": 4,
  },
  targetPaths: [COMMENT_EDITOR_PATH, STYLE_PATH],
  validation: DEFAULT_VALIDATION,
});

export async function applyCommentDraftCounter(sandbox) {
  const editor = await sandbox.readText(COMMENT_EDITOR_PATH);
  const styles = await sandbox.readText(STYLE_PATH);

  await sandbox.writeText(COMMENT_EDITOR_PATH, updateEditor(editor));
  await sandbox.writeText(STYLE_PATH, updateStyles(styles));

  return {
    changedFiles: commentDraftCounterSkill.targetPaths,
    summary: "Comment editor now shows a deterministic remaining character counter.",
  };
}

function updateEditor(source) {
  if (source.includes("comment-draft-counter")) return source;

  const formAnchor = "function CommentEditor({ updateComments }) {";
  const textareaAnchor = `        ></textarea>
      </div>`;
  assertIncludes(source, formAnchor, { filePath: COMMENT_EDITOR_PATH, skillId: SKILL_ID });
  assertIncludes(source, textareaAnchor, { filePath: COMMENT_EDITOR_PATH, skillId: SKILL_ID });

  return source
    .replace(
      '  const [{ body }, setForm] = useState({ body: "" });',
      `  const [{ body }, setForm] = useState({ body: "" });\n  const remainingCharacters = ${COMMENT_LIMIT} - body.length;`,
    )
    .replace(
      textareaAnchor,
      `        ></textarea>
        <small className="comment-draft-counter">
          {remainingCharacters} characters remaining
        </small>
      </div>`,
    );
}

function updateStyles(source) {
  return insertBeforeAnchorOnce(source, {
    marker: ".comment-draft-counter",
    anchor: ".article-page .comment-form .card-block textarea {",
    insert: `.comment-draft-counter {
  display: block;
  margin-top: 0.35rem;
  color: var(--text-light);
  font-size: 0.75rem;
  text-align: right;
}`,
    filePath: STYLE_PATH,
    skillId: SKILL_ID,
  });
}
