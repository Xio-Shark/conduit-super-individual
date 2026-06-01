import { registerRunClarificationRoutes } from "./runClarificationRoutes.js";
import { registerRunEvidenceRoutes } from "./runEvidenceRoutes.js";
import { registerRunExecutionRoutes } from "./runExecutionRoutes.js";
import { registerRunReviewRoutes } from "./runReviewRoutes.js";

export function registerRunRoutes(app, context) {
  registerRunExecutionRoutes(app, context);
  registerRunEvidenceRoutes(app, context.runStore);
  registerRunReviewRoutes(app, context);
  registerRunClarificationRoutes(app, context);
}
