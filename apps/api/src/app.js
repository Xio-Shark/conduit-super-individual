import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import { runP0Delivery } from "../../../services/orchestrator/src/orchestrator.js";
import { createGitHubPrClient } from "../../../external/git-provider/src/githubPrClient.js";
import { registerErrorHandler } from "./apiErrors.js";
import { createRunStore } from "./runStore.js";
import { registerRunRoutes } from "./runRoutes.js";
import { registerSystemRoutes } from "./systemRoutes.js";

const PROJECT_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

export function createApp(options = {}) {
  const app = express();
  const context = createAppContext(options);

  configureMiddleware(app);
  registerSystemRoutes(app, context.projectRoot);
  registerRunRoutes(app, context);
  registerErrorHandler(app);

  return app;
}

function createAppContext(options) {
  const projectRoot = options.projectRoot || PROJECT_ROOT;
  return {
    gitProvider: options.gitProvider || createGitHubPrClient,
    projectRoot,
    runDelivery: options.runDelivery || runP0Delivery,
    runStore: createRunStore(projectRoot),
  };
}

function configureMiddleware(app) {
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));
}
