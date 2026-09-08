/**
 * Pure constants + types for the shared "connect one or many accounts"
 * outcome vocabulary (Messenger page picker, Instagram account picker,
 * WhatsApp phone-number picker). This file MUST stay dependency-free (zero
 * imports) — it is the client-safe leaf `@chatbotx.io/business` exposes via
 * the `./inbox/connect-outcome-types` subpath so browser/jsdom code
 * (`apps/builder/src/features/channel-connect/**`) can read these values
 * without pulling in the full business barrel, which transitively
 * initializes the database client, Pino, etc.
 *
 * The exception-to-outcome mapping functions (`toConnectItemFailure`,
 * `toConnectSessionError`), which DO need `ChatbotXException`/`SdkException`,
 * live in `./connect-outcome.ts` (server-only) and re-export everything from
 * here — never duplicate these values there.
 *
 * `apps/builder/src/features/channel-connect/schema/index.ts` builds zod
 * schemas over these constants (`z.enum(Object.values(...))`) — this file
 * stays the single source of truth for the string values.
 */

export const CONNECT_ITEM_STATUSES = {
  connected: "connected",
  duplicated: "duplicated",
  limitReached: "limitReached",
  failed: "failed",
} as const
export type ConnectItemStatus =
  (typeof CONNECT_ITEM_STATUSES)[keyof typeof CONNECT_ITEM_STATUSES]

export const CONNECT_FAILURE_REASONS = {
  // id not in the trusted provider list / disabled row / forged.
  notSelectable: "notSelectable",
  alreadyConnected: "alreadyConnected",
  channelLimit: "channelLimit",
  workspaceLimit: "workspaceLimit",
  // SdkException from Meta.
  providerRejected: "providerRejected",
  unknown: "unknown",
} as const
export type ConnectFailureReason =
  (typeof CONNECT_FAILURE_REASONS)[keyof typeof CONNECT_FAILURE_REASONS]

/** Follow-up after commit failed; the row exists. */
export const CONNECT_WARNINGS = { followUpFailed: "followUpFailed" } as const
export type ConnectWarning =
  (typeof CONNECT_WARNINGS)[keyof typeof CONNECT_WARNINGS]

/**
 * Conditions that make every remaining request in a multi-select batch
 * pointless. They are NOT thrown as generic errors — `executeAsync` (next-
 * safe-action) never rejects; `handleServerError` turns a thrown exception
 * into a translated `serverError` string the client cannot classify — so an
 * action returns them as a typed, machine-readable variant instead
 * (`ConnectActionResult`).
 */
export const CONNECT_SESSION_ERROR_CODES = {
  // Pending-auth cookie / signup session missing, expired, or invalid.
  sessionExpired: "sessionExpired",
  // Raised by `notWorkspaceMemberException()`, NOT the generic `notFound`.
  notMember: "notMember",
  trialExpired: "trialExpired",
  macLimitReached: "macLimitReached",
  credentialMissing: "credentialMissing",
} as const
export type ConnectSessionErrorCode =
  (typeof CONNECT_SESSION_ERROR_CODES)[keyof typeof CONNECT_SESSION_ERROR_CODES]

/** What every single-account connect action returns. */
export type ConnectActionResult<TOutcome> =
  | { kind: "outcome"; outcome: TOutcome }
  | { kind: "sessionError"; code: ConnectSessionErrorCode }

/**
 * Cap on `ConnectOutcome.detail` — the provider's own end-user sentence, only
 * ever carried by a `failed`/`providerRejected` row. Shared by the business
 * mapper (`providerDetailFrom`, `./connect-outcome.ts`) and the builder's zod
 * schema (`apps/builder/src/features/channel-connect/schema/index.ts`) so the
 * two cannot drift: a longer sentence would be truncated by one and rejected
 * by the other.
 */
export const MAX_CONNECT_DETAIL_LENGTH = 200
