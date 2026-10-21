import { ChatbotXException } from "@chatbotx.io/business/errors"
import type { ConnectErrorQueryCode } from "@chatbotx.io/utils/connection"
import {
  type CreateChannelErrorCode,
  isCreateChannelErrorCode,
} from "@/lib/workspace/create-first-workspace"

/** Marks the "nothing to pick" failure, whose copy the channel's page chooses. */
const NO_CANDIDATES = "noCandidates"

/**
 * Connect failures the user can act on, keyed by the stored session
 * `errorCode` and by the callback's `?connect_error=` (same values, plus
 * `provider_unavailable` for a retryable outage that leaves the session
 * active rather than failed). Anything else reads as a plain expiry.
 */
const ACTIONABLE_FAILURES: Partial<
  Record<ConnectErrorQueryCode, CreateChannelErrorCode | typeof NO_CANDIDATES>
> = {
  no_candidates: NO_CANDIDATES,
  exchange_failed: "exchangeFailed",
  provider_error: "providerError",
  provider_unavailable: "providerError",
  internal_error: "connectFailed",
}

/** Whether a stored session `errorCode` (or `connect_error`) is worth telling its owner about. */
export function isActionableConnectFailure(
  code: string,
): code is ConnectErrorQueryCode {
  return Object.hasOwn(ACTIONABLE_FAILURES, code)
}

function actionableErrorCode(
  code: unknown,
  noCandidatesError: CreateChannelErrorCode,
): CreateChannelErrorCode | null {
  if (typeof code !== "string" || !isActionableConnectFailure(code)) {
    return null
  }
  const mapped = ACTIONABLE_FAILURES[code]
  return mapped === NO_CANDIDATES ? noCandidatesError : (mapped ?? null)
}

/** Exception codes that have their own create-page copy under another name. */
const RENAMED_EXCEPTION_CODES: Readonly<
  Record<string, CreateChannelErrorCode>
> = {
  notWorkspaceMember: "notMember",
}

/**
 * The `/channels/create?error=` code for a select page whose session could
 * not be resolved. For an expired/unusable session the precise reason wins:
 * first the owner's own failed-session code (`data.failureCode`, set by
 * `resolveConnectSessionCore` only after the ownership check), then the
 * callback's `connect_error`. The URL value only picks which copy this same
 * browser sees, so trusting it reveals nothing. `noCandidatesError` is the
 * channel's own "nothing to pick" copy, so this stays channel-agnostic.
 */
export function selectPageErrorCode(
  err: ChatbotXException,
  options: {
    noCandidatesError: CreateChannelErrorCode
    connectError?: string | null
  },
): CreateChannelErrorCode {
  if (err.code === "connectSessionExpired") {
    const precise =
      actionableErrorCode(err.data?.failureCode, options.noCandidatesError) ??
      actionableErrorCode(options.connectError, options.noCandidatesError)
    if (precise) {
      return precise
    }
  }
  const renamed = RENAMED_EXCEPTION_CODES[err.code]
  if (renamed) {
    return renamed
  }
  return isCreateChannelErrorCode(err.code) ? err.code : "sessionExpired"
}

/**
 * The `/channels/create?error=` code when a connect could not even start
 * (`startChannelConnect`). Never "session expired": no session existed yet.
 */
export function startFailureErrorCode(err: unknown): CreateChannelErrorCode {
  if (!(err instanceof ChatbotXException)) {
    return "connectFailed"
  }
  if (err.code === "connectSessionLimitReached") {
    return "tooManyAttempts"
  }
  return isCreateChannelErrorCode(err.code) && err.code !== "sessionExpired"
    ? err.code
    : "connectFailed"
}
