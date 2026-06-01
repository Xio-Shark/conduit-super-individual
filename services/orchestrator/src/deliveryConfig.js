import { fileURLToPath } from "node:url";
import { RUN_STAGES } from "../../../libs/types/src/stages.js";

export const PROJECT_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

export const RESUME_STAGE_ORDER = Object.freeze([
  RUN_STAGES.CLARIFYING,
  RUN_STAGES.PLANNING,
  RUN_STAGES.EDITING,
  RUN_STAGES.VERIFYING,
  RUN_STAGES.PR_DRAFTING,
]);
