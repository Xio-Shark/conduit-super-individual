export function checkArticleDraftCrossStackSync({ sandboxFiles }) {
  const preview = requireChangedFile(
    sandboxFiles,
    "frontend/src/components/ArticlesPreview/ArticlesPreview.jsx",
  );
  const model = requireChangedFile(sandboxFiles, "backend/models/Article.js");
  const controller = requireChangedFile(sandboxFiles, "backend/controllers/articles.js");

  const frontendHasDraft = /article\.draft/.test(preview.content)
    && /className="draft-badge"/.test(preview.content);
  const backendModelHasDraft = /draft:\s*DataTypes\.BOOLEAN/.test(model.content);
  const backendControllerHasDraft = /draft:\s*false/.test(controller.content);
  const backendHasDraft = backendModelHasDraft && backendControllerHasDraft;

  if (frontendHasDraft && backendHasDraft) {
    return {
      status: "passed",
      frontendHasDraft,
      backendControllerHasDraft,
      backendModelHasDraft,
    };
  }

  return {
    status: "failed",
    backendControllerHasDraft,
    frontendHasDraft,
    backendModelHasDraft,
    backendHasDraft,
    message: "L2 draft skill requires draft references in both frontend and backend paths",
  };
}

function requireChangedFile(files, path) {
  const file = files.find((entry) => entry.path === path);
  if (!file) {
    throw new Error(`cross-stack-sync requires changed file ${path}`);
  }
  return file;
}

export async function loadChangedFileContents(sandbox, changedFiles) {
  const files = [];
  for (const filePath of changedFiles) {
    files.push({
      path: filePath,
      content: await sandbox.readText(filePath),
    });
  }
  return files;
}
