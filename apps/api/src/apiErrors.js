import {
  GitHubConfigError,
  GitHubRequestError,
} from "../../../external/git-provider/src/githubPrClient.js";
import { PrSubmissionError } from "./prSubmission.js";
import { RunConfirmationError } from "./runConfirmation.js";
import { ClarificationAnswerError } from "./runClarificationRoutes.js";

export function registerErrorHandler(app) {
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    res.status(errorStatus(error)).json({
      error: {
        message: error.message,
      },
    });
  });
}

function errorStatus(error) {
  if (error.statusCode) return error.statusCode;
  if (error instanceof RunConfirmationError) return 400;
  if (error instanceof PrSubmissionError) return 400;
  if (error instanceof ClarificationAnswerError) return error.statusCode || 400;
  if (error instanceof GitHubConfigError) return 400;
  if (error instanceof GitHubRequestError) return 502;
  return 500;
}
