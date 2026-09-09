import { ChatbotXException } from "@chatbotx.io/business/errors"

/**
 * Narrows a caught error to a service-thrown, field-scoped validation
 * failure (`validationException` in `packages/business/src/errors.ts`).
 * Prefer this over a duck-typed `"code" in error` check — a driver or
 * runtime error can carry an unrelated `code` property, and only a real
 * `ChatbotXException` is guaranteed to carry `field`/`message` safe to show
 * a user.
 */
export function isValidationException(
  error: unknown,
): error is ChatbotXException & { code: "validation" } {
  return error instanceof ChatbotXException && error.code === "validation"
}

/**
 * Narrows a caught error to a service-thrown `notFoundException`
 * (`packages/business/src/errors.ts`). Use this to turn a missing row into a
 * `notFound()` response while letting a DB connection failure or other
 * Drizzle error propagate as a real 500 instead of being swallowed.
 */
export function isNotFoundException(
  error: unknown,
): error is ChatbotXException & { code: "notFound" } {
  return error instanceof ChatbotXException && error.code === "notFound"
}
