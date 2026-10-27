import type { AIFileProcessingRunErrorCode } from "@chatbotx.io/database/partials"
import { UnrecoverableError } from "bullmq"

/**
 * A deterministic failure of an AI file run: retrying cannot change the
 * outcome, so BullMQ fails the job at once instead of backing off. The
 * heavy worker's `failed` handler records `code` on the run.
 */
export class AIFileProcessingError extends UnrecoverableError {
  readonly code: AIFileProcessingRunErrorCode

  constructor(code: AIFileProcessingRunErrorCode, options?: ErrorOptions) {
    super(code)
    this.name = "AIFileProcessingError"
    this.code = code
    if (options?.cause !== undefined) {
      this.cause = options.cause
    }
  }
}
