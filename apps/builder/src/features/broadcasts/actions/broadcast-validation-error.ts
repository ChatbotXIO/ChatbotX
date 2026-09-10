import { BroadcastValidationException } from "@chatbotx.io/business"
import { returnValidationErrors } from "next-safe-action"
import { createBroadcastRequest } from "../schema/action"

/**
 * Runs a service call that may reject the payload and turns a
 * `BroadcastValidationException` into the field-level form error the create
 * and edit actions both report; anything else keeps propagating.
 */
export async function withBroadcastValidationErrors<T>(
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (error instanceof BroadcastValidationException) {
      return returnValidationErrors(createBroadcastRequest, {
        _errors: ["Validation Exception"],
        [error.field]: { _errors: [error.message] },
      })
    }
    throw error
  }
}
