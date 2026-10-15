import { returnValidationErrors } from "next-safe-action"
import { isValidationException } from "@/lib/errors/validation-exception"
import type {
  createMiniAppRequest,
  updateMiniAppRequest,
} from "../schema/action"

/** Shows a taken name under the form's name field; rethrows any other error. */
export function returnNameTakenError(
  schema: typeof createMiniAppRequest | typeof updateMiniAppRequest,
  error: unknown,
): never {
  if (isValidationException(error) && error.field === "name") {
    return returnValidationErrors(schema, {
      name: { _errors: [error.message] },
    })
  }
  throw error
}
