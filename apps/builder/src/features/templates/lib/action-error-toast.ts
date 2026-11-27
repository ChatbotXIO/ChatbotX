import { toast } from "sonner"

export type ActionError = {
  serverError?: unknown
  validationErrors?: unknown
  bindArgsValidationErrors?: unknown
  thrownError?: unknown
}

/** The first message of a formatted validation error (`{ _errors: [...], field: { _errors: [...] } }`). */
const firstValidationMessage = (errors: unknown): string | undefined => {
  if (Array.isArray(errors)) {
    for (const entry of errors) {
      const found = firstValidationMessage(entry)
      if (found) {
        return found
      }
    }
    return
  }
  if (typeof errors !== "object" || errors === null) {
    return
  }
  const { _errors: own, ...fields } = errors as {
    _errors?: unknown
    [field: string]: unknown
  }
  if (Array.isArray(own)) {
    const message = own.find((entry) => typeof entry === "string")
    if (message) {
      return message
    }
  }
  return firstValidationMessage(Object.values(fields))
}

/**
 * Tells the user why an action failed: the server's message, else the first
 * validation message, else `fallbackMessage` (a thrown error, or a failure
 * with nothing to say). Never silent, so a click always has a visible outcome.
 */
export const toastActionError = (
  error: ActionError,
  fallbackMessage: string,
): void => {
  if (typeof error.serverError === "string" && error.serverError) {
    toast.error(error.serverError)
    return
  }
  toast.error(
    firstValidationMessage(error.validationErrors) ??
      firstValidationMessage(error.bindArgsValidationErrors) ??
      fallbackMessage,
  )
}
