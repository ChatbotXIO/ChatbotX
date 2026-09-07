import { SdkException } from "@chatbotx.io/sdk"
import { ChatbotXException, sanitizePublicText } from "../errors"
import {
  CONNECT_FAILURE_REASONS,
  CONNECT_SESSION_ERROR_CODES,
  type ConnectFailureReason,
  type ConnectItemStatus,
  type ConnectSessionErrorCode,
  MAX_CONNECT_DETAIL_LENGTH,
} from "./connect-outcome-types"

/**
 * Exception-code mapping functions for the shared connect-outcome
 * vocabulary. The pure constants/types live in `./connect-outcome-types.ts`
 * (dependency-free — re-exported below unchanged) so client code can import
 * just those without pulling in `ChatbotXException`/`SdkException` and their
 * transitive dependencies (Pino, drizzle-orm). Never redefine the values
 * re-exported here — `connect-outcome-types.ts` stays the single source of
 * truth.
 */
export * from "./connect-outcome-types"

/** Only used by `toConnectItemFailure` below — never exported. */
type ConnectFailureOutcome = {
  status: Exclude<ConnectItemStatus, "connected">
  reason: ConnectFailureReason
  /**
   * The provider's own end-user sentence. Set only for the reasons listed in
   * `REASONS_CARRYING_PROVIDER_DETAIL`; absent for every reason we author
   * ourselves, whose translated copy already says all there is to say.
   */
  detail?: string
}

/** Exception code → item-level outcome. Anything not listed falls through to `unknown`. */
const OUTCOME_BY_EXCEPTION_CODE: Readonly<
  Record<string, ConnectFailureOutcome>
> = {
  channelDuplicated: { status: "duplicated", reason: "alreadyConnected" },
  channelLimitReached: { status: "limitReached", reason: "channelLimit" },
  workspaceLimitReached: {
    status: "limitReached",
    reason: "workspaceLimit",
  },
}

/** Exception code → session error; anything not listed is an item-level failure. */
const SESSION_ERROR_BY_EXCEPTION_CODE: Readonly<
  Record<string, ConnectSessionErrorCode>
> = {
  connectSessionExpired: CONNECT_SESSION_ERROR_CODES.sessionExpired,
  signupSessionExpired: CONNECT_SESSION_ERROR_CODES.sessionExpired,
  notWorkspaceMember: CONNECT_SESSION_ERROR_CODES.notMember,
  trialExpired: CONNECT_SESSION_ERROR_CODES.trialExpired,
  macLimitReached: CONNECT_SESSION_ERROR_CODES.macLimitReached,
  credentialMissing: CONNECT_SESSION_ERROR_CODES.credentialMissing,
}

/**
 * Resolves a thrown error to a session-level error code, or `null` when it
 * is only an item-level failure (`toConnectItemFailure` handles those).
 */
export function toConnectSessionError(
  error: unknown,
): ConnectSessionErrorCode | null {
  if (!(error instanceof ChatbotXException && error.code)) {
    return null
  }
  return SESSION_ERROR_BY_EXCEPTION_CODE[error.code] ?? null
}

function baseConnectItemFailure(error: unknown): ConnectFailureOutcome {
  if (error instanceof ChatbotXException && error.code) {
    return (
      OUTCOME_BY_EXCEPTION_CODE[error.code] ?? {
        status: "failed",
        reason: "unknown",
      }
    )
  }
  if (error instanceof SdkException) {
    return { status: "failed", reason: "providerRejected" }
  }
  return { status: "failed", reason: "unknown" }
}

/**
 * Integration exceptions park the provider payload on `originError`, in one
 * of two shapes — both are read here rather than one being guessed at:
 *
 * - normalized `{ userTitle, userMessage }`, what a channel's error mapper
 *   sets (`integrations/whatsapp/src/lib/error-mapper.ts` `mapApiFields` and
 *   its Messenger/Instagram siblings);
 * - the raw Graph body, which `rescue()` re-parks unchanged
 *   (`integrations/whatsapp/src/exception.ts`) — there Meta's end-user
 *   sentence is `error_user_msg`, and the body sits either at the root or
 *   under one of `GRAPH_BODY_KEYS` (ky's parsed `data`, `rescue`'s
 *   `errorBody`, the explicit `response` wrapper).
 */
const NORMALIZED_DETAIL_KEYS = ["userMessage", "userTitle"] as const
// Meta-authored fields only, in end-user precedence. The SDK exception's own
// `message` is deliberately NOT a fallback: for a ky timeout/network failure it
// is the request URL, which carries the WABA id and the app's system-user id.
const GRAPH_DETAIL_KEYS = [
  "error_user_msg",
  "error_user_title",
  "message",
] as const
const GRAPH_BODY_KEYS = ["data", "errorBody", "response"] as const

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

function readRecord(
  source: Record<string, unknown> | undefined,
  key: string,
): Record<string, unknown> | undefined {
  const value = source?.[key]
  return isRecord(value) ? value : undefined
}

/** First non-blank string among `keys`, trimmed. */
function readFirstString(
  source: Record<string, unknown> | undefined,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const value = source?.[key]
    const text = typeof value === "string" ? value.trim() : ""
    if (text) {
      return text
    }
  }
  return
}

/** The Graph `error` object, wherever the wrapper it arrived in put it. */
function readGraphError(
  origin: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  const direct = readRecord(origin, "error")
  if (direct) {
    return direct
  }
  for (const key of GRAPH_BODY_KEYS) {
    const nested = readRecord(readRecord(origin, key), "error")
    if (nested) {
      return nested
    }
  }
  return
}

/**
 * The provider's own END-USER-facing sentence for a rejected connect:
 * `error_user_msg` when Meta wrote one, else `error_user_title`, else the
 * Graph error's own `message`. Never the SDK exception's message (a transport
 * failure's message is the request URL), a stack, a token, or a raw body — the text goes
 * through `sanitizePublicText` (the same redactor every persisted public
 * error message uses) and is capped at `MAX_CONNECT_DETAIL_LENGTH`.
 *
 * Returns `undefined` for anything that is not an `SdkException`: only a
 * provider call produces one, so only a provider rejection has a detail.
 */
export function providerDetailFrom(error: unknown): string | undefined {
  if (!(error instanceof SdkException)) {
    return
  }
  // `toConnectItemFailure` runs inside a catch block: throwing here would
  // turn a reportable row into a crashed action. Anything that passed the
  // `instanceof` check but does not carry the accessor (a test double, a
  // hand-built exception) yields no detail at all.
  const originError: unknown =
    typeof error.getOriginError === "function"
      ? error.getOriginError()
      : undefined
  const origin = isRecord(originError) ? originError : undefined
  const text =
    readFirstString(origin, NORMALIZED_DETAIL_KEYS) ??
    readFirstString(readGraphError(origin), GRAPH_DETAIL_KEYS)
  if (!text) {
    return
  }
  return sanitizePublicText(text, MAX_CONNECT_DETAIL_LENGTH) || undefined
}

/**
 * Reasons whose row may carry the provider's own sentence — a table, so
 * adding one later is a row here rather than a new branch downstream. Every
 * other reason is authored by us, and its translated copy already says
 * everything there is to say.
 */
const REASONS_CARRYING_PROVIDER_DETAIL: ReadonlySet<ConnectFailureReason> =
  new Set([CONNECT_FAILURE_REASONS.providerRejected])

function withProviderDetail(
  outcome: ConnectFailureOutcome,
  error: unknown,
): ConnectFailureOutcome {
  if (!REASONS_CARRYING_PROVIDER_DETAIL.has(outcome.reason)) {
    return outcome
  }
  const detail = providerDetailFrom(error)
  return detail ? { ...outcome, detail } : outcome
}

/**
 * Maps a thrown error to an item-level `(status, reason)` pair, plus the
 * provider's own `detail` sentence when the reason is one that carries it.
 * Call this only after `toConnectSessionError` returns `null` — a
 * session-level error stops the batch instead of being reported per item.
 */
export function toConnectItemFailure(error: unknown): ConnectFailureOutcome {
  return withProviderDetail(baseConnectItemFailure(error), error)
}
