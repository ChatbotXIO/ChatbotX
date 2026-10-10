import { z } from "zod"

export const connectionStatuses = z.enum([
  "connected",
  "degraded",
  "needs_reauth",
  "paused",
  "disconnected",
])
export type ConnectionStatus = z.infer<typeof connectionStatuses>

export const ACTIVE_CONNECTION_STATUSES = [
  "connected",
  "degraded",
] as const satisfies readonly ConnectionStatus[]
export type ActiveConnectionStatus = (typeof ACTIVE_CONNECTION_STATUSES)[number]
export const INACTIVE_CONNECTION_STATUSES = [
  "needs_reauth",
  "paused",
  "disconnected",
] as const satisfies readonly ConnectionStatus[]
/** Fails to type-check when a status is omitted from either partition. */
type AssertEqual<A, B> = [A] extends [B]
  ? [B] extends [A]
    ? true
    : never
  : never
const _assertConnectionStatusPartitionIsExhaustive: AssertEqual<
  ConnectionStatus,
  | (typeof ACTIVE_CONNECTION_STATUSES)[number]
  | (typeof INACTIVE_CONNECTION_STATUSES)[number]
> = true

/** Why a connection last moved into (or stayed in) a non-`connected` status. */
export const connectionStatusReasons = z.enum([
  "manual",
  "workspace_purge",
  "trial_expired",
  "tenant_suspended",
  "token_revoked",
  "provider_revoked",
  "refresh_failed",
  "verify_failed",
  "quota_exceeded",
  "orphaned_webhook",
])
export type ConnectionStatusReason = z.infer<typeof connectionStatusReasons>

/**
 * `Inbox.disconnectReason` predates this `Connection` domain and is narrower
 * than `ConnectionStatusReason`. Lives here (not `@chatbotx.io/database`) for
 * the same reason `connectionStatusReasons` above does — re-exported from
 * `@chatbotx.io/database/partials` for existing backend importers (mirrors
 * the `inboxStatuses` precedent in `@chatbotx.io/utils/conversation`).
 */
export const inboxDisconnectReasons = z.enum([
  "manual",
  "workspace_purge",
  "trial_expired",
  "tenant_suspended",
  "token_revoked",
])
export type InboxDisconnectReason = z.infer<typeof inboxDisconnectReasons>

/**
 * `workspace_purge`, `trial_expired`, and `tenant_suspended` map 1-1 onto
 * their own `Inbox.disconnectReason` values (matching how disconnects were
 * `disconnectReason` directly, before this `Connection` layer existed) —
 * they must NOT collapse into the generic `manual` bucket. Reasons with no
 * Inbox-native equivalent (`verify_failed`, `quota_exceeded`,
 * `orphaned_webhook`) fall back to `manual`.
 */
export const CONNECTION_TO_INBOX_DISCONNECT_REASON: Record<
  ConnectionStatusReason,
  InboxDisconnectReason
> = {
  manual: "manual",
  workspace_purge: "workspace_purge",
  trial_expired: "trial_expired",
  tenant_suspended: "tenant_suspended",
  token_revoked: "token_revoked",
  provider_revoked: "token_revoked",
  refresh_failed: "token_revoked",
  verify_failed: "manual",
  quota_exceeded: "manual",
  orphaned_webhook: "manual",
}

/**
 * Each Inbox and each Integration owns at most one Connection. This enum is
 * re-declared here as a Zod enum (same rationale as `channelTypes`) so the
 * database layer and public API schemas can validate against it without
 * depending on the SDK package.
 */
export const connectionKinds = z.enum(["channel", "integration"])
export type ConnectionKind = z.infer<typeof connectionKinds>

export const connectionConfigFieldSchema = z.object({
  name: z.string(),
  type: z.enum(["string", "secret", "number", "boolean", "enum", "url"]),
  required: z.boolean(),
  labelKey: z.string().optional(),
  enumValues: z.array(z.string()).optional(),
  description: z.string().optional(),
})
export type ConnectionConfigField = z.infer<typeof connectionConfigFieldSchema>

export const connectSessionNextActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("open_url"), url: z.string() }),
  z.object({
    type: z.literal("enter_input"),
    inputFields: z.array(connectionConfigFieldSchema),
  }),
  z.object({ type: z.literal("wait") }),
])
export type ConnectSessionNextAction = z.infer<
  typeof connectSessionNextActionSchema
>

/** `ConnectSession.purpose` — set server-side, never accepted from client input. */
export const connectSessionPurposes = z.enum([
  "connect",
  "reconnect",
  "facebook_ads",
  "messaging_ads",
  "lead_ads",
  "meta_catalog",
])
export type ConnectSessionPurpose = z.infer<typeof connectSessionPurposes>

/** `ConnectSession.status` lifecycle. `expireDue` transitions due rows to `expired`. */
export const connectSessionStatuses = z.enum([
  "pending",
  "authorized",
  "awaiting_selection",
  "completed",
  "failed",
  "expired",
  "cancelled",
])
export type ConnectSessionStatus = z.infer<typeof connectSessionStatuses>

export const ACTIVE_CONNECT_SESSION_STATUSES = [
  "pending",
  "authorized",
  "awaiting_selection",
] as const satisfies readonly ConnectSessionStatus[]
export const TERMINAL_CONNECT_SESSION_STATUSES = [
  "completed",
  "failed",
  "expired",
  "cancelled",
] as const satisfies readonly ConnectSessionStatus[]
/** Fails to type-check when a status is omitted from either partition. */
const _assertConnectSessionStatusPartitionIsExhaustive: AssertEqual<
  ConnectSessionStatus,
  | (typeof ACTIVE_CONNECT_SESSION_STATUSES)[number]
  | (typeof TERMINAL_CONNECT_SESSION_STATUSES)[number]
> = true

export const connectSessionErrorCodes = z.enum([
  "state_mismatch",
  "expired",
  "provider_denied",
  "exchange_failed",
  "provider_error",
  "no_candidates",
  "already_connected",
  "quota_exceeded",
  "trial_expired",
  "internal_error",
])
export type ConnectSessionErrorCode = z.infer<typeof connectSessionErrorCodes>

/**
 * Provider-specific reasons a connect failed, finer than the stored
 * `ConnectSessionErrorCode` (a DB CHECK-constrained column, so it cannot grow
 * without a migration). They travel only in the `connect_error` redirect
 * parameter, never in the database.
 */
export const connectFailureCauses = z.enum([
  "developer_token_missing",
  "developer_token_not_approved",
  "project_not_approved",
  "permission_denied",
  "api_not_enabled",
  "credentials_invalid",
  "scope_missing",
  "legacy_upload_not_allowed",
])
export type ConnectFailureCause = z.infer<typeof connectFailureCauses>

/** Query parameter the OAuth callback appends to the return URL on a failed or stalled connect. */
export const CONNECT_ERROR_QUERY_PARAM = "connect_error"

/** Every value the `connect_error` query parameter may carry; anything else must be ignored. */
export const connectErrorQueryCodes = z.enum([
  ...connectSessionErrorCodes.options,
  "provider_unavailable",
  ...connectFailureCauses.options,
])
export type ConnectErrorQueryCode = z.infer<typeof connectErrorQueryCodes>

const URL_SCHEME_PATTERN = /^[a-z][a-z\d+.-]*:/i

/**
 * `returnUrl` with `?connect_error=<code>` set, preserving its other query
 * params (e.g. `?session=`) and hash. A relative URL stays relative.
 */
export const appendConnectError = (
  returnUrl: string,
  code: ConnectErrorQueryCode,
): string => {
  const isAbsolute = URL_SCHEME_PATTERN.test(returnUrl)
  const url = new URL(returnUrl, "http://relative.invalid")
  url.searchParams.set(CONNECT_ERROR_QUERY_PARAM, code)
  if (isAbsolute) {
    return url.toString()
  }
  const relative = `${url.pathname}${url.search}${url.hash}`
  // URL normalisation can turn `/..//evil.com` into `//evil.com`, which a
  // browser reads as a protocol-relative URL to another host. Never emit one:
  // fall back to the site root, keeping only the error code.
  return isSafeRelativeRedirect(relative)
    ? relative
    : `/?${CONNECT_ERROR_QUERY_PARAM}=${code}`
}

/** A single leading `/` (not `//` or `/\`), no backslash, no control characters. */
const isSafeRelativeRedirect = (value: string): boolean => {
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  ) {
    return false
  }
  return !Array.from(value).some((character) => {
    const point = character.charCodeAt(0)
    return point <= 31 || point === 127
  })
}

const failureCauseCandidate = (error: object): unknown => {
  if ("failureCause" in error) {
    return error.failureCause
  }
  if ("data" in error && typeof error.data === "object" && error.data) {
    return (error.data as { cause?: unknown }).cause
  }
  return
}

/**
 * The provider-specific failure cause carried by a thrown connect error, if
 * any: `ConnectionProviderRejectedError.failureCause` or the `cause` entry of
 * a `ChatbotXException.data`. Duck-typed so this package needs neither class.
 */
export const connectFailureCauseOf = (
  error: unknown,
): ConnectFailureCause | undefined => {
  if (typeof error !== "object" || error === null) {
    return
  }
  const candidate = failureCauseCandidate(error)
  const parsed = connectFailureCauses.safeParse(candidate)
  return parsed.success ? parsed.data : undefined
}
