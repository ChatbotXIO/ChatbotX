import { ORPCError } from "@orpc/client"

const POST_MESSAGE_QUOTA_EXCEEDED = "postMessageQuotaExceeded"

type Translate = (
  key:
    | "composer.postMessageQuotaExceeded"
    | "composer.removalPermissionMissing",
) => string

/** True when the error is the oRPC refusal for a used-up message quota. */
const isQuotaExceededError = (error: Error): boolean =>
  error instanceof ORPCError && error.code === POST_MESSAGE_QUOTA_EXCEEDED

/** The toast text of a failed post action: translated for a used-up quota, else the server message. */
export const postActionErrorMessage = (error: Error, t: Translate): string =>
  isQuotaExceededError(error)
    ? t("composer.postMessageQuotaExceeded")
    : error.message

/** The failure text of a destination or part: translated for known codes, else its stored message. */
export const failureText = (
  failure: {
    errorCode?: string | null
    errorMessage?: string | null
  },
  t: Translate,
): string | null | undefined => {
  if (failure.errorCode === POST_MESSAGE_QUOTA_EXCEEDED) {
    return t("composer.postMessageQuotaExceeded")
  }
  if (failure.errorCode === "removalPermissionMissing") {
    return t("composer.removalPermissionMissing")
  }
  return failure.errorMessage
}
