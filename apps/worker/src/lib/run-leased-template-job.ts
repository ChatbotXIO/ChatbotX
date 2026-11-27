import {
  isPermanentTemplateError,
  isTemplateLeaseLost,
  templateErrorCodeOf,
} from "@chatbotx.io/business/template-errors"
import { type Job, UnrecoverableError } from "bullmq"
import { normalizeError } from "universal-error-normalizer"
import { isFinalAttempt } from "./job-attempts"
import { logger } from "./logger"

type LeasedTemplateJob = {
  job: Job
  /** The log line when the job fails. */
  failureMessage: string
  /** Identifies the row in the failure log. */
  logContext: Record<string, unknown>
  /** The code recorded for a failure that carries none of its own. */
  unknownErrorCode: string
  /** The leased work; any throw is classified below. */
  run: () => Promise<void>
  /** Hands the lease back so BullMQ's retry (or the sweep) runs the job again. */
  release: () => Promise<void>
  /** Closes the row terminally. Fenced by the claim token, so a stale worker is a no-op. */
  fail: (errorCode: string, error: unknown) => Promise<void>
}

/**
 * The shared tail of the install, sync and uninstall workers (all claim a row
 * with a lease first, then run bounded work fenced by it):
 *  - a lost lease is a silent return: a newer claim owns the row;
 *  - a permanent failure closes the row and stops BullMQ's retries;
 *  - the final attempt closes the row, an earlier one releases the lease;
 *  - anything else is rethrown so BullMQ retries.
 */
export async function runLeasedTemplateJob(
  input: LeasedTemplateJob,
): Promise<void> {
  try {
    await input.run()
  } catch (error) {
    if (isTemplateLeaseLost(error)) {
      return
    }
    const errorCode = templateErrorCodeOf(error, input.unknownErrorCode)
    logger.error(
      { err: normalizeError(error), ...input.logContext, errorCode },
      input.failureMessage,
    )
    if (isPermanentTemplateError(errorCode)) {
      await input.fail(errorCode, error)
      throw new UnrecoverableError(
        error instanceof Error ? error.message : errorCode,
      )
    }
    if (isFinalAttempt(input.job)) {
      await input.fail(errorCode, error)
    } else {
      await input.release()
    }
    throw error
  }
}
