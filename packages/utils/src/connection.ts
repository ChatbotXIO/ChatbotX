import { z } from "zod"

/**
 * The three connection families driving the `Connection.status` state
 * machine (`packages/business/src/connection/state.ts`).
 *
 * ACTIVE = `connected | degraded` — quota is held, `Inbox.status = connected`.
 * INACTIVE = `needs_reauth | paused | disconnected` — quota is released,
 * `Inbox.status = disconnected`. Quota is consumed exactly on an
 * INACTIVE/absent → ACTIVE edge and released exactly on ACTIVE → INACTIVE,
 * nowhere else.
 */
export const connectionStatuses = z.enum([
  "connected",
  "degraded",
  "needs_reauth",
  "paused",
  "disconnected",
])
export type ConnectionStatus = z.infer<typeof connectionStatuses>

export const ACTIVE_CONNECTION_STATUSES: readonly ConnectionStatus[] = [
  "connected",
  "degraded",
]
export const INACTIVE_CONNECTION_STATUSES: readonly ConnectionStatus[] = [
  "needs_reauth",
  "paused",
  "disconnected",
]

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
 * Legacy mirror for `Inbox.disconnectReason` — narrower than
 * `ConnectionStatusReason`. Kept in sync manually (not derived) because the
 * two enums serve different audiences: `Connection` reasons are precise for
 * the API/audit trail, `Inbox.disconnectReason` predates this domain and its
 * values are already load-bearing (UI copy, exports).
 */
export const CONNECTION_TO_INBOX_DISCONNECT_REASON: Record<
  ConnectionStatusReason,
  "manual" | "token_revoked"
> = {
  manual: "manual",
  workspace_purge: "manual",
  trial_expired: "manual",
  tenant_suspended: "manual",
  token_revoked: "token_revoked",
  provider_revoked: "token_revoked",
  refresh_failed: "token_revoked",
  verify_failed: "manual",
  quota_exceeded: "manual",
  orphaned_webhook: "manual",
}

/**
 * Same three-way split `packages/sdk`'s `ConnectionKind` uses, re-declared
 * here as a Zod enum (same rationale as `channelTypes`) so the database layer
 * and public API schemas can validate against it without depending on the
 * SDK package. `sub_connection` is reserved — no reader/writer uses it yet.
 */
export const connectionKinds = z.enum([
  "channel",
  "integration",
  "sub_connection",
])
export type ConnectionKind = z.infer<typeof connectionKinds>

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

/** `ConnectSession.status` lifecycle. `expiresAt <= now()` reads as `expired` regardless of the stored value. */
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

export const connectSessionErrorCodes = z.enum([
  "state_mismatch",
  "expired",
  "provider_denied",
  "provider_error",
  "no_candidates",
  "already_connected",
  "quota_exceeded",
  "trial_expired",
  "internal_error",
])
export type ConnectSessionErrorCode = z.infer<typeof connectSessionErrorCodes>
