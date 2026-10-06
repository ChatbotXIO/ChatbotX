import type { Oauth2AuthValue } from "@chatbotx.io/sdk"
import { authValueSchema } from "@chatbotx.io/sdk"
import { inArray } from "drizzle-orm"
import type { DatabaseClient } from "../../src/client"
import type {
  ChannelType,
  ConnectionStatus,
  ConnectionStatusReason,
  InboxDisconnectReason,
  IntegrationType,
} from "../../src/partials"
import { CONNECTION_TO_INBOX_DISCONNECT_REASON } from "../../src/partials"
import { connectionModel } from "../../src/schema"
import type { Candidate } from "./types"

export const parseOauth2Auth = (authRaw: unknown): Oauth2AuthValue | null => {
  const parsed = authValueSchema.safeParse(authRaw)
  if (!parsed.success || parsed.data.authType !== "oauth2") {
    return null
  }
  return parsed.data
}

/**
 * Mirrors `@chatbotx.io/business/connection`'s `authExpiresAtOf` — not
 * importable here (see the module doc comment: `@chatbotx.io/business`
 * already depends on `@chatbotx.io/database`, so the reverse import would be
 * circular). Keep the two in sync if the `AuthValue` oauth2 shape changes.
 */
export const authExpiresAtOf = (authRaw: unknown): Date | null => {
  const oauth = parseOauth2Auth(authRaw)
  return oauth?.tokens.expiresAt ? new Date(oauth.tokens.expiresAt) : null
}

export const metadataString = (
  oauth: Oauth2AuthValue | null,
  key: string,
): string | undefined => {
  const value = oauth?.metadata?.[key]
  return typeof value === "string" && value.length > 0 ? value : undefined
}

type ChannelStatusResult = {
  status: ConnectionStatus
  statusReason: ConnectionStatusReason | null
  disconnectedAt: Date | null
  legacyNeedsReauthHeuristic: boolean
}

/**
 * The channel status decision table from the backfill plan:
 *
 * | source state                               | status        | statusReason     | disconnectedAt            |
 * |---------------------------------------------|---------------|------------------|----------------------------|
 * | connected, no tokenRefreshError              | connected     | NULL             | NULL                       |
 * | connected, has tokenRefreshError             | degraded      | refresh_failed   | NULL                       |
 * | disconnected, reason token_revoked or NULL   | needs_reauth  | token_revoked    | NULL                       |
 * | disconnected, reason manual/workspace_purge/ | disconnected  | same reason      | Inbox.disconnectedAt ?? now|
 * | trial_expired                                |               |                  |                            |
 * | disconnected, reason tenant_suspended        | paused        | tenant_suspended | NULL                       |
 */
const computeChannelStatus = (
  inbox: {
    status: string
    disconnectReason: InboxDisconnectReason | null
    disconnectedAt: Date | null
  },
  tokenRefreshError: string | null,
): ChannelStatusResult => {
  if (inbox.status === "connected") {
    return tokenRefreshError
      ? {
          status: "degraded",
          statusReason: "refresh_failed",
          disconnectedAt: null,
          legacyNeedsReauthHeuristic: false,
        }
      : {
          status: "connected",
          statusReason: null,
          disconnectedAt: null,
          legacyNeedsReauthHeuristic: false,
        }
  }
  const reason = inbox.disconnectReason
  if (reason === "tenant_suspended") {
    return {
      status: "paused",
      statusReason: "tenant_suspended",
      disconnectedAt: null,
      legacyNeedsReauthHeuristic: false,
    }
  }
  if (
    reason === "manual" ||
    reason === "workspace_purge" ||
    reason === "trial_expired"
  ) {
    return {
      status: "disconnected",
      statusReason: reason,
      disconnectedAt: inbox.disconnectedAt ?? new Date(),
      legacyNeedsReauthHeuristic: false,
    }
  }
  // reason === "token_revoked" or NULL. A NULL reason on a disconnected inbox
  // predates reason-recording (the legacy `markOffline`/disconnect path) —
  // heuristically treated the same as an explicit `token_revoked`, flagged via
  // `legacyNeedsReauthHeuristic` so the caller can report it as a conflict to
  // review rather than silently assuming it.
  return {
    status: "needs_reauth",
    statusReason: "token_revoked",
    disconnectedAt: null,
    legacyNeedsReauthHeuristic: reason == null,
  }
}

export type ChannelJoinRow = {
  inboxId: string
  workspaceId: string
  inboxStatus: string
  disconnectReason: InboxDisconnectReason | null
  disconnectedAt: Date | null
  createdAt: Date
  sourceId: string
  authRaw: unknown
  tokenRefreshError: string | null
}

export const toChannelCandidate = (
  provider: IntegrationType,
  channel: ChannelType,
  row: ChannelJoinRow,
  displayName: string,
): Candidate => {
  const statusResult = computeChannelStatus(
    {
      status: row.inboxStatus,
      disconnectReason: row.disconnectReason,
      disconnectedAt: row.disconnectedAt,
    },
    row.tokenRefreshError,
  )
  return {
    provider,
    kind: "channel",
    channel,
    workspaceId: row.workspaceId,
    inboxId: row.inboxId,
    integrationId: null,
    sourceId: row.sourceId,
    displayName: displayName.trim().length > 0 ? displayName : channel,
    status: statusResult.status,
    statusReason: statusResult.statusReason,
    disconnectedAt: statusResult.disconnectedAt,
    authExpiresAt: authExpiresAtOf(row.authRaw),
    connectedAt: row.createdAt,
    legacyNeedsReauthHeuristic: statusResult.legacyNeedsReauthHeuristic,
  }
}

export type ConnectionByFkRow = {
  inboxId: string | null
  integrationId: string | null
  provider: IntegrationType
  sourceId: string
  status: ConnectionStatus
  statusReason: ConnectionStatusReason | null
  disconnectedAt: Date | null
}

/**
 * Bulk lookup of existing `Connection` rows by their `inboxId`/`integrationId`
 * foreign key, keyed by that same id — used both to detect a candidate whose
 * Inbox/Integration already owns a Connection row under a different
 * `sourceId` (`process-provider.ts`'s `detectExistingConnectionConflicts`)
 * and to compare an existing row's status against a freshly recomputed
 * candidate (`verify.ts`'s `runVerify`).
 */
export const loadConnectionsByFk = async (
  client: DatabaseClient,
  fkIds: string[],
  isChannel: boolean,
): Promise<Map<string, ConnectionByFkRow>> => {
  if (fkIds.length === 0) {
    return new Map()
  }
  const rows = await client
    .select({
      inboxId: connectionModel.inboxId,
      integrationId: connectionModel.integrationId,
      provider: connectionModel.provider,
      sourceId: connectionModel.sourceId,
      status: connectionModel.status,
      statusReason: connectionModel.statusReason,
      disconnectedAt: connectionModel.disconnectedAt,
    })
    .from(connectionModel)
    .where(
      isChannel
        ? inArray(connectionModel.inboxId, fkIds)
        : inArray(connectionModel.integrationId, fkIds),
    )
  return new Map(
    rows.map((row) => [(row.inboxId ?? row.integrationId) as string, row]),
  )
}

/**
 * `degraded` and `ConnectionStatusReason` are both finer-grained than the
 * legacy `Inbox`/satellite columns `computeChannelStatus` recomputes from, so
 * a byte-for-byte compare false-positives on a Connection the LIVE engine has
 * since transitioned:
 *  - the engine can mark a channel `degraded` (`markDegradedByIdentifier`,
 *    reasons like `refresh_failed`/`provider_revoked`) without ever writing
 *    the legacy `tokenRefreshError` column, so a candidate recomputed as
 *    `connected` from legacy data alone is still consistent with an existing
 *    `degraded` row — `degraded` must not REQUIRE `tokenRefreshError`.
 *  - `ConnectionStatusReason` is wider than `InboxDisconnectReason` (e.g.
 *    `provider_revoked`/`refresh_failed` both collapse to the legacy
 *    `token_revoked` value) — translate the existing row's reason through
 *    `CONNECTION_TO_INBOX_DISCONNECT_REASON` (the authoritative 1-1 mapping
 *    from `@chatbotx.io/utils`, read-only here) before comparing.
 */
export const connectionAgreesWithCandidate = (
  existing: {
    provider: IntegrationType
    sourceId: string
    status: ConnectionStatus
    statusReason: ConnectionStatusReason | null
    disconnectedAt: Date | null
  },
  candidate: Candidate,
): boolean => {
  if (
    existing.provider !== candidate.provider ||
    existing.sourceId !== candidate.sourceId
  ) {
    return false
  }
  if (
    existing.status === "degraded" &&
    (candidate.status === "connected" || candidate.status === "degraded")
  ) {
    return true
  }
  if (existing.status !== candidate.status) {
    return false
  }
  const mappedExistingReason = existing.statusReason
    ? CONNECTION_TO_INBOX_DISCONNECT_REASON[existing.statusReason]
    : null
  if ((mappedExistingReason ?? null) !== (candidate.statusReason ?? null)) {
    return false
  }
  return (
    (existing.disconnectedAt === null) === (candidate.disconnectedAt === null)
  )
}
