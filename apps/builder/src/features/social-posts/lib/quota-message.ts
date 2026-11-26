import { ORPCError } from "@orpc/client"

const POST_MESSAGE_QUOTA_EXCEEDED = "postMessageQuotaExceeded"

/** Failure codes the server stores that have a translated text, by message key. */
const FAILURE_TEXT_KEYS = {
  postMessageQuotaExceeded: "composer.postMessageQuotaExceeded",
  removalPermissionMissing: "composer.removalPermissionMissing",
  removalQueueFailed: "composer.removalQueueFailed",
} as const

type FailureTextCode = keyof typeof FAILURE_TEXT_KEYS

type Translate = (key: (typeof FAILURE_TEXT_KEYS)[FailureTextCode]) => string

const hasTranslatedText = (
  code: string | null | undefined,
): code is FailureTextCode =>
  code !== null && code !== undefined && Object.hasOwn(FAILURE_TEXT_KEYS, code)

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
  if (hasTranslatedText(failure.errorCode)) {
    return t(FAILURE_TEXT_KEYS[failure.errorCode])
  }
  return failure.errorMessage
}
