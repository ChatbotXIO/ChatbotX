/**
 * Backfills `Connection` rows for every pre-existing Inbox/Integration
 * satellite row that predates the `Connection` table (plan: Phase 4 of
 * "Rà soát Connection (v1.11.0 → origin/main) + chuyển lưu trữ sang bảng
 * `Connection`").
 *
 * Mechanism: for each provider, pull candidate rows via a keyset-paginated
 * SELECT (Inbox x satellite for channels, Integration x satellite for
 * workspace integrations), compute the desired `Connection` row in TypeScript
 * (status mapping is a small decision table, far more legible here than as a
 * SQL CASE tree), then bulk `INSERT ... ON CONFLICT (workspaceId, provider,
 * sourceId) DO NOTHING`, batched per provider with one transaction per batch.
 * A second run always inserts 0 new rows (`--verify` proves this).
 *
 * This intentionally does NOT call `upsertConnectionRow` / go through
 * `@chatbotx.io/business`'s connection engine: `@chatbotx.io/database` cannot
 * depend on `@chatbotx.io/business` (the dependency points the other way),
 * and this backfill never touches `UserQuota`/`WorkspaceUsage` — it is a pure
 * backfill of `Connection` rows, not a quota recompute. `authExpiresAtOf`'s
 * one-line logic is duplicated locally (see below) for the same layering
 * reason.
 *
 * Usage:
 *   pnpm --filter @chatbotx.io/database db:backfill-connections -- --dry-run
 *   pnpm --filter @chatbotx.io/database db:backfill-connections
 *   pnpm --filter @chatbotx.io/database db:backfill-connections -- --provider=whatsapp --workspace=123
 *   pnpm --filter @chatbotx.io/database db:backfill-connections -- --verify
 *
 * Flags:
 *   --dry-run          Count + print a sample of what would be inserted. No writes.
 *   --provider=<type>  Restrict to one `IntegrationType`.
 *   --workspace=<id>   Restrict to one workspace id.
 *   --verify           Report (1) Inbox rows (for every backfilled channel type) with
 *                      no matching Connection row, (2) Integration rows (for every
 *                      backfilled integration type) with no matching Connection row,
 *                      (3) Connection rows whose status disagrees with their source.
 *                      All three must be 0 after a successful backfill, and stay 0 on
 *                      every subsequent run.
 *
 * Skipped entirely (no adapter / no live feature): threads, metaCatalog,
 * outlookCalendar, chatbotx.
 */

import type { Oauth2AuthValue } from "@chatbotx.io/sdk"
import { authValueSchema } from "@chatbotx.io/sdk"
import { and, asc, eq, gt, inArray, isNull, sql } from "drizzle-orm"
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core"
import { type DatabaseClient, db } from "../src/client"
import type {
  ChannelType,
  ConnectionStatus,
  ConnectionStatusReason,
  InboxDisconnectReason,
  IntegrationType,
} from "../src/partials"
import { integrationTypes } from "../src/partials"
import {
  connectionModel,
  inboxModel,
  integrationActiveCampaignModel,
  integrationApiModel,
  integrationClaudeModel,
  integrationDeepseekModel,
  integrationDripModel,
  integrationFacebookAdsModel,
  integrationGeminiModel,
  integrationGetResponseModel,
  integrationGoogleCalendarModel,
  integrationGoogleSheetsModel,
  integrationInstagramModel,
  integrationKlaviyoModel,
  integrationMailchimpModel,
  integrationMailerLiteModel,
  integrationMessengerModel,
  integrationModel,
  integrationMoosendModel,
  integrationOpenaiCompatibleModel,
  integrationOpenaiModel,
  integrationOpenrouterModel,
  integrationSendGridModel,
  integrationSmtpModel,
  integrationTelegramModel,
  integrationTiktokModel,
  integrationWebchatModel,
  integrationWhatsappModel,
  integrationZaloModel,
} from "../src/schema"

const BATCH_SIZE = 500
const SAMPLE_SIZE = 10

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BackfillConnectionsOptions = {
  dryRun?: boolean
  provider?: IntegrationType
  workspaceId?: string
  verify?: boolean
}

export type Candidate = {
  provider: IntegrationType
  kind: "channel" | "integration"
  channel: ChannelType | null
  workspaceId: string
  inboxId: string | null
  integrationId: string | null
  sourceId: string
  displayName: string
  status: ConnectionStatus
  statusReason: ConnectionStatusReason | null
  disconnectedAt: Date | null
  authExpiresAt: Date | null
  connectedAt: Date
  /** `true` when a `needs_reauth` mapping came from the NULL-reason legacy heuristic (see `processProvider`). */
  legacyNeedsReauthHeuristic: boolean
}

export type ProviderStat = {
  provider: IntegrationType
  scanned: number
  inserted: number
}

export type BackfillConflict = {
  kind:
    | "duplicate_source_inbox"
    | "duplicate_zalo_oaid"
    | "legacy_needs_reauth_heuristic"
  provider: IntegrationType
  workspaceId?: string
  sourceId?: string
  detail: string
}

export type VerifyCounts = {
  channelInboxesMissingConnection: number
  integrationsMissingConnection: number
  statusMismatches: number
}

export type BackfillConnectionsResult = {
  dryRun: boolean
  counts: ProviderStat[]
  totalInserted: number
  conflicts: BackfillConflict[]
  sample: Candidate[]
  verify?: VerifyCounts
}

type BatchArgs = {
  workspaceId?: string
  cursor: string | null
  limit: number
}

type BatchResult = { candidates: Candidate[]; nextCursor: string | null }

type BatchFetcher = (
  client: DatabaseClient,
  args: BatchArgs,
) => Promise<BatchResult>

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Mirrors `@chatbotx.io/business/connection`'s `authExpiresAtOf` — not
 * importable here (see the module doc comment: `@chatbotx.io/business`
 * already depends on `@chatbotx.io/database`, so the reverse import would be
 * circular). Keep the two in sync if the `AuthValue` oauth2 shape changes.
 */
const parseOauth2Auth = (authRaw: unknown): Oauth2AuthValue | null => {
  const parsed = authValueSchema.safeParse(authRaw)
  if (!parsed.success || parsed.data.authType !== "oauth2") {
    return null
  }
  return parsed.data
}

const authExpiresAtOf = (authRaw: unknown): Date | null => {
  const oauth = parseOauth2Auth(authRaw)
  return oauth?.tokens.expiresAt ? new Date(oauth.tokens.expiresAt) : null
}

const metadataString = (
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

type ChannelJoinRow = {
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

const toChannelCandidate = (
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

// ---------------------------------------------------------------------------
// Channel-provider fetchers (kind: "channel", keyed off `Inbox.id`)
// ---------------------------------------------------------------------------

const fetchMessengerBatch: BatchFetcher = async (
  client,
  { workspaceId, cursor, limit },
) => {
  const rows = await client
    .select({
      inboxId: inboxModel.id,
      workspaceId: inboxModel.workspaceId,
      inboxStatus: inboxModel.status,
      disconnectReason: inboxModel.disconnectReason,
      disconnectedAt: inboxModel.disconnectedAt,
      createdAt: inboxModel.createdAt,
      sourceId: integrationMessengerModel.pageId,
      name: integrationMessengerModel.name,
      authRaw: integrationMessengerModel.auth,
      tokenRefreshError: integrationMessengerModel.tokenRefreshError,
    })
    .from(inboxModel)
    .innerJoin(
      integrationMessengerModel,
      eq(integrationMessengerModel.inboxId, inboxModel.id),
    )
    .where(
      and(
        eq(inboxModel.channel, "messenger"),
        workspaceId ? eq(inboxModel.workspaceId, workspaceId) : undefined,
        cursor ? gt(inboxModel.id, cursor) : undefined,
      ),
    )
    .orderBy(asc(inboxModel.id))
    .limit(limit)
  const candidates = rows.map((row) =>
    toChannelCandidate("messenger", "messenger", row, row.name || "Messenger"),
  )
  return { candidates, nextCursor: rows.at(-1)?.inboxId ?? null }
}

const fetchInstagramVariant =
  (provider: IntegrationType, type: "instagram" | "facebook"): BatchFetcher =>
  async (client, { workspaceId, cursor, limit }) => {
    const rows = await client
      .select({
        inboxId: inboxModel.id,
        workspaceId: inboxModel.workspaceId,
        inboxStatus: inboxModel.status,
        disconnectReason: inboxModel.disconnectReason,
        disconnectedAt: inboxModel.disconnectedAt,
        createdAt: inboxModel.createdAt,
        sourceId: integrationInstagramModel.igId,
        name: integrationInstagramModel.name,
        authRaw: integrationInstagramModel.auth,
        tokenRefreshError: integrationInstagramModel.tokenRefreshError,
      })
      .from(inboxModel)
      .innerJoin(
        integrationInstagramModel,
        eq(integrationInstagramModel.inboxId, inboxModel.id),
      )
      .where(
        and(
          eq(inboxModel.channel, "instagram"),
          eq(integrationInstagramModel.type, type),
          workspaceId ? eq(inboxModel.workspaceId, workspaceId) : undefined,
          cursor ? gt(inboxModel.id, cursor) : undefined,
        ),
      )
      .orderBy(asc(inboxModel.id))
      .limit(limit)
    const candidates = rows.map((row) =>
      toChannelCandidate(provider, "instagram", row, row.name || "Instagram"),
    )
    return { candidates, nextCursor: rows.at(-1)?.inboxId ?? null }
  }

const fetchWhatsappBatch: BatchFetcher = async (
  client,
  { workspaceId, cursor, limit },
) => {
  const rows = await client
    .select({
      inboxId: inboxModel.id,
      workspaceId: inboxModel.workspaceId,
      inboxStatus: inboxModel.status,
      disconnectReason: inboxModel.disconnectReason,
      disconnectedAt: inboxModel.disconnectedAt,
      createdAt: inboxModel.createdAt,
      sourceId: integrationWhatsappModel.phoneNumberId,
      name: integrationWhatsappModel.name,
      displayPhoneNumber: integrationWhatsappModel.displayPhoneNumber,
      authRaw: integrationWhatsappModel.auth,
      tokenRefreshError: integrationWhatsappModel.tokenRefreshError,
    })
    .from(inboxModel)
    .innerJoin(
      integrationWhatsappModel,
      eq(integrationWhatsappModel.inboxId, inboxModel.id),
    )
    .where(
      and(
        eq(inboxModel.channel, "whatsapp"),
        workspaceId ? eq(inboxModel.workspaceId, workspaceId) : undefined,
        cursor ? gt(inboxModel.id, cursor) : undefined,
      ),
    )
    .orderBy(asc(inboxModel.id))
    .limit(limit)
  const candidates = rows.map((row) =>
    toChannelCandidate(
      "whatsapp",
      "whatsapp",
      row,
      row.name || row.displayPhoneNumber || "WhatsApp",
    ),
  )
  return { candidates, nextCursor: rows.at(-1)?.inboxId ?? null }
}

const fetchTelegramBatch: BatchFetcher = async (
  client,
  { workspaceId, cursor, limit },
) => {
  const rows = await client
    .select({
      inboxId: inboxModel.id,
      workspaceId: inboxModel.workspaceId,
      inboxStatus: inboxModel.status,
      disconnectReason: inboxModel.disconnectReason,
      disconnectedAt: inboxModel.disconnectedAt,
      createdAt: inboxModel.createdAt,
      sourceId: integrationTelegramModel.botId,
      authRaw: integrationTelegramModel.auth,
    })
    .from(inboxModel)
    .innerJoin(
      integrationTelegramModel,
      eq(integrationTelegramModel.inboxId, inboxModel.id),
    )
    .where(
      and(
        eq(inboxModel.channel, "telegram"),
        workspaceId ? eq(inboxModel.workspaceId, workspaceId) : undefined,
        cursor ? gt(inboxModel.id, cursor) : undefined,
      ),
    )
    .orderBy(asc(inboxModel.id))
    .limit(limit)
  // Telegram bot tokens are static (no OAuth refresh cycle), so this channel
  // never has a tokenRefreshError column and can never be "degraded".
  const candidates = rows.map((row) =>
    toChannelCandidate(
      "telegram",
      "telegram",
      { ...row, tokenRefreshError: null },
      "Telegram bot",
    ),
  )
  return { candidates, nextCursor: rows.at(-1)?.inboxId ?? null }
}

const fetchTiktokBatch: BatchFetcher = async (
  client,
  { workspaceId, cursor, limit },
) => {
  const rows = await client
    .select({
      inboxId: inboxModel.id,
      workspaceId: inboxModel.workspaceId,
      inboxStatus: inboxModel.status,
      disconnectReason: inboxModel.disconnectReason,
      disconnectedAt: inboxModel.disconnectedAt,
      createdAt: inboxModel.createdAt,
      sourceId: integrationTiktokModel.openId,
      name: integrationTiktokModel.name,
      authRaw: integrationTiktokModel.auth,
      tokenRefreshError: integrationTiktokModel.tokenRefreshError,
    })
    .from(inboxModel)
    .innerJoin(
      integrationTiktokModel,
      eq(integrationTiktokModel.inboxId, inboxModel.id),
    )
    .where(
      and(
        eq(inboxModel.channel, "tiktok"),
        workspaceId ? eq(inboxModel.workspaceId, workspaceId) : undefined,
        cursor ? gt(inboxModel.id, cursor) : undefined,
      ),
    )
    .orderBy(asc(inboxModel.id))
    .limit(limit)
  // `name` is TikTok's connect-time `display_name`; `Inbox.sourceId` (not used
  // here) holds `username` instead. Fall back to `auth.metadata.username` for
  // the rare legacy row where `name` came back empty.
  const candidates = rows.map((row) =>
    toChannelCandidate(
      "tiktok",
      "tiktok",
      row,
      row.name ||
        metadataString(parseOauth2Auth(row.authRaw), "username") ||
        "TikTok",
    ),
  )
  return { candidates, nextCursor: rows.at(-1)?.inboxId ?? null }
}

const fetchZaloBatch: BatchFetcher = async (
  client,
  { workspaceId, cursor, limit },
) => {
  const rows = await client
    .select({
      inboxId: inboxModel.id,
      workspaceId: inboxModel.workspaceId,
      inboxStatus: inboxModel.status,
      disconnectReason: inboxModel.disconnectReason,
      disconnectedAt: inboxModel.disconnectedAt,
      createdAt: inboxModel.createdAt,
      sourceId: integrationZaloModel.oaId,
      name: integrationZaloModel.name,
      authRaw: integrationZaloModel.auth,
      tokenRefreshError: integrationZaloModel.tokenRefreshError,
    })
    .from(inboxModel)
    .innerJoin(
      integrationZaloModel,
      eq(integrationZaloModel.inboxId, inboxModel.id),
    )
    .where(
      and(
        eq(inboxModel.channel, "zalo"),
        workspaceId ? eq(inboxModel.workspaceId, workspaceId) : undefined,
        cursor ? gt(inboxModel.id, cursor) : undefined,
      ),
    )
    .orderBy(asc(inboxModel.id))
    .limit(limit)
  const candidates = rows.map((row) =>
    toChannelCandidate("zalo", "zalo", row, row.name || "Zalo OA"),
  )
  return { candidates, nextCursor: rows.at(-1)?.inboxId ?? null }
}

const fetchApiBatch: BatchFetcher = async (
  client,
  { workspaceId, cursor, limit },
) => {
  const rows = await client
    .select({
      inboxId: inboxModel.id,
      workspaceId: inboxModel.workspaceId,
      inboxStatus: inboxModel.status,
      disconnectReason: inboxModel.disconnectReason,
      disconnectedAt: inboxModel.disconnectedAt,
      createdAt: inboxModel.createdAt,
      sourceId: integrationApiModel.id,
      name: integrationApiModel.name,
      authRaw: integrationApiModel.auth,
    })
    .from(inboxModel)
    .innerJoin(
      integrationApiModel,
      eq(integrationApiModel.inboxId, inboxModel.id),
    )
    .where(
      and(
        eq(inboxModel.channel, "api"),
        workspaceId ? eq(inboxModel.workspaceId, workspaceId) : undefined,
        cursor ? gt(inboxModel.id, cursor) : undefined,
      ),
    )
    .orderBy(asc(inboxModel.id))
    .limit(limit)
  const candidates = rows.map((row) =>
    toChannelCandidate(
      "api",
      "api",
      { ...row, tokenRefreshError: null },
      row.name || "API",
    ),
  )
  return { candidates, nextCursor: rows.at(-1)?.inboxId ?? null }
}

const fetchSmtpBatch: BatchFetcher = async (
  client,
  { workspaceId, cursor, limit },
) => {
  const rows = await client
    .select({
      inboxId: inboxModel.id,
      workspaceId: inboxModel.workspaceId,
      inboxStatus: inboxModel.status,
      disconnectReason: inboxModel.disconnectReason,
      disconnectedAt: inboxModel.disconnectedAt,
      createdAt: inboxModel.createdAt,
      sourceId: integrationSmtpModel.id,
      name: integrationSmtpModel.name,
      authRaw: integrationSmtpModel.auth,
    })
    .from(inboxModel)
    .innerJoin(
      integrationSmtpModel,
      eq(integrationSmtpModel.inboxId, inboxModel.id),
    )
    .where(
      and(
        eq(inboxModel.channel, "smtp"),
        workspaceId ? eq(inboxModel.workspaceId, workspaceId) : undefined,
        cursor ? gt(inboxModel.id, cursor) : undefined,
      ),
    )
    .orderBy(asc(inboxModel.id))
    .limit(limit)
  const candidates = rows.map((row) =>
    toChannelCandidate(
      "smtp",
      "smtp",
      { ...row, tokenRefreshError: null },
      row.name || "SMTP",
    ),
  )
  return { candidates, nextCursor: rows.at(-1)?.inboxId ?? null }
}

const fetchWebchatBatch: BatchFetcher = async (
  client,
  { workspaceId, cursor, limit },
) => {
  const rows = await client
    .select({
      inboxId: inboxModel.id,
      workspaceId: inboxModel.workspaceId,
      inboxStatus: inboxModel.status,
      disconnectReason: inboxModel.disconnectReason,
      disconnectedAt: inboxModel.disconnectedAt,
      createdAt: inboxModel.createdAt,
      sourceId: integrationWebchatModel.id,
      name: integrationWebchatModel.name,
      authRaw: integrationWebchatModel.auth,
    })
    .from(inboxModel)
    .innerJoin(
      integrationWebchatModel,
      eq(integrationWebchatModel.inboxId, inboxModel.id),
    )
    .where(
      and(
        eq(inboxModel.channel, "webchat"),
        workspaceId ? eq(inboxModel.workspaceId, workspaceId) : undefined,
        cursor ? gt(inboxModel.id, cursor) : undefined,
      ),
    )
    .orderBy(asc(inboxModel.id))
    .limit(limit)
  const candidates = rows.map((row) =>
    toChannelCandidate(
      "webchat",
      "webchat",
      { ...row, tokenRefreshError: null },
      row.name || "Webchat",
    ),
  )
  return { candidates, nextCursor: rows.at(-1)?.inboxId ?? null }
}

// ---------------------------------------------------------------------------
// Integration-provider fetchers (kind: "integration", keyed off `Integration.id`)
// ---------------------------------------------------------------------------

/** Human labels for the single-per-workspace providers, which have no `name` column of their own. */
const INTEGRATION_DISPLAY_NAMES = {
  activeCampaign: "ActiveCampaign",
  claude: "Claude",
  deepseek: "DeepSeek",
  drip: "Drip",
  facebookAds: "Facebook Ads",
  gemini: "Gemini",
  getResponse: "GetResponse",
  klaviyo: "Klaviyo",
  mailchimp: "Mailchimp",
  mailerLite: "MailerLite",
  moosend: "Moosend",
  openai: "OpenAI",
  openrouter: "OpenRouter",
  sendGrid: "SendGrid",
} as const satisfies Partial<Record<IntegrationType, string>>

/**
 * Shape shared by every "one row per workspace, `sourceId` = literal
 * `'workspace'`" integration satellite table. Every provider's `disconnect()`
 * deletes both the satellite row and its `Integration` row outright (no soft
 * disconnected/degraded state at this level — checked across
 * activeCampaign/klaviyo/claude's `service.ts`), so a live row is always
 * `status: "connected"`. `facebookAds` is the one exception (its own `status`
 * column survives a transient failure instead of deleting the row) and gets
 * its own fetcher below instead of this factory.
 */
type WorkspaceSingletonTable = PgTable & {
  id: AnyPgColumn
  workspaceId: AnyPgColumn
  integrationId: AnyPgColumn
  auth: AnyPgColumn
  createdAt: AnyPgColumn
}

const makeWorkspaceSingletonFetcher = <TTable extends WorkspaceSingletonTable>(
  provider: IntegrationType,
  table: TTable,
  displayName: string,
): BatchFetcher => {
  // `.from()` rejects a generic `TTable` param (Drizzle resolves it against
  // the exact table's config) — upcast once here, same as
  // `store-bindings.ts`'s `makeChannelBinding`/`makeWorkspaceIntegrationBinding`.
  const rawTable: PgTable = table
  return async (client, { workspaceId, cursor, limit }) => {
    const rows = await client
      .select({
        integrationId: table.integrationId,
        workspaceId: table.workspaceId,
        authRaw: table.auth,
        createdAt: table.createdAt,
        cursorId: table.id,
      })
      .from(rawTable)
      .where(
        and(
          workspaceId ? eq(table.workspaceId, workspaceId) : undefined,
          cursor ? gt(table.id, cursor) : undefined,
        ),
      )
      .orderBy(asc(table.id))
      .limit(limit)
    const candidates: Candidate[] = rows.map((row) => ({
      provider,
      kind: "integration",
      channel: null,
      workspaceId: row.workspaceId as string,
      inboxId: null,
      integrationId: row.integrationId as string,
      sourceId: "workspace",
      displayName,
      status: "connected",
      statusReason: null,
      disconnectedAt: null,
      authExpiresAt: authExpiresAtOf(row.authRaw),
      connectedAt: row.createdAt as Date,
      legacyNeedsReauthHeuristic: false,
    }))
    return {
      candidates,
      nextCursor: (rows.at(-1)?.cursorId as string | undefined) ?? null,
    }
  }
}

const fetchFacebookAdsBatch: BatchFetcher = async (
  client,
  { workspaceId, cursor, limit },
) => {
  const rawTable: PgTable = integrationFacebookAdsModel
  const rows = await client
    .select({
      integrationId: integrationFacebookAdsModel.integrationId,
      workspaceId: integrationFacebookAdsModel.workspaceId,
      createdAt: integrationFacebookAdsModel.createdAt,
      cursorId: integrationFacebookAdsModel.id,
      status: integrationFacebookAdsModel.status,
      tokenExpiresAt: integrationFacebookAdsModel.tokenExpiresAt,
    })
    .from(rawTable)
    .where(
      and(
        workspaceId
          ? eq(integrationFacebookAdsModel.workspaceId, workspaceId)
          : undefined,
        cursor ? gt(integrationFacebookAdsModel.id, cursor) : undefined,
      ),
    )
    .orderBy(asc(integrationFacebookAdsModel.id))
    .limit(limit)
  const candidates: Candidate[] = rows.map((row) => ({
    provider: "facebookAds",
    kind: "integration",
    channel: null,
    workspaceId: row.workspaceId,
    inboxId: null,
    integrationId: row.integrationId,
    sourceId: "workspace",
    displayName: INTEGRATION_DISPLAY_NAMES.facebookAds,
    // `status: "invalid"` is set by the token-refresh worker on a 190 (expired
    // token) error and cleared on the next successful `upsert` — the closest
    // thing this provider has to `auth.revoked`.
    status: row.status === "invalid" ? "needs_reauth" : "connected",
    statusReason: row.status === "invalid" ? "token_revoked" : null,
    disconnectedAt: null,
    authExpiresAt: row.tokenExpiresAt,
    connectedAt: row.createdAt,
    legacyNeedsReauthHeuristic: false,
  }))
  return { candidates, nextCursor: rows.at(-1)?.cursorId ?? null }
}

const fetchGoogleCalendarBatch: BatchFetcher = async (
  client,
  { workspaceId, cursor, limit },
) => {
  const rawTable: PgTable = integrationGoogleCalendarModel
  const rows = await client
    .select({
      integrationId: integrationGoogleCalendarModel.integrationId,
      workspaceId: integrationGoogleCalendarModel.workspaceId,
      authRaw: integrationGoogleCalendarModel.auth,
      createdAt: integrationGoogleCalendarModel.createdAt,
      cursorId: integrationGoogleCalendarModel.id,
      providerCalendarId: integrationGoogleCalendarModel.providerCalendarId,
      email: integrationGoogleCalendarModel.email,
    })
    .from(rawTable)
    .where(
      and(
        workspaceId
          ? eq(integrationGoogleCalendarModel.workspaceId, workspaceId)
          : undefined,
        cursor ? gt(integrationGoogleCalendarModel.id, cursor) : undefined,
      ),
    )
    .orderBy(asc(integrationGoogleCalendarModel.id))
    .limit(limit)
  const candidates: Candidate[] = rows.map((row) => ({
    provider: "googleCalendar",
    kind: "integration",
    channel: null,
    workspaceId: row.workspaceId,
    inboxId: null,
    integrationId: row.integrationId,
    sourceId: row.providerCalendarId,
    displayName: row.email || "Google Calendar",
    status: "connected",
    statusReason: null,
    disconnectedAt: null,
    authExpiresAt: authExpiresAtOf(row.authRaw),
    connectedAt: row.createdAt,
    legacyNeedsReauthHeuristic: false,
  }))
  return { candidates, nextCursor: rows.at(-1)?.cursorId ?? null }
}

const fetchGoogleSheetsBatch: BatchFetcher = async (
  client,
  { workspaceId, cursor, limit },
) => {
  const rawTable: PgTable = integrationGoogleSheetsModel
  const rows = await client
    .select({
      integrationId: integrationGoogleSheetsModel.integrationId,
      workspaceId: integrationGoogleSheetsModel.workspaceId,
      authRaw: integrationGoogleSheetsModel.auth,
      createdAt: integrationGoogleSheetsModel.createdAt,
      cursorId: integrationGoogleSheetsModel.id,
    })
    .from(rawTable)
    .where(
      and(
        workspaceId
          ? eq(integrationGoogleSheetsModel.workspaceId, workspaceId)
          : undefined,
        cursor ? gt(integrationGoogleSheetsModel.id, cursor) : undefined,
      ),
    )
    .orderBy(asc(integrationGoogleSheetsModel.id))
    .limit(limit)
  const candidates: Candidate[] = rows.map((row) => {
    const oauth = parseOauth2Auth(row.authRaw)
    const accountId = metadataString(oauth, "accountId")
    const email = metadataString(oauth, "email")
    return {
      provider: "googleSheets",
      kind: "integration",
      channel: null,
      workspaceId: row.workspaceId,
      inboxId: null,
      integrationId: row.integrationId,
      sourceId: accountId ?? `legacy:${row.integrationId}`,
      displayName: email ?? "Google Sheets",
      status: "connected",
      statusReason: null,
      disconnectedAt: null,
      authExpiresAt: authExpiresAtOf(row.authRaw),
      connectedAt: row.createdAt,
      legacyNeedsReauthHeuristic: false,
    }
  })
  return { candidates, nextCursor: rows.at(-1)?.cursorId ?? null }
}

const fetchOpenaiCompatibleBatch: BatchFetcher = async (
  client,
  { workspaceId, cursor, limit },
) => {
  const rawTable: PgTable = integrationOpenaiCompatibleModel
  const rows = await client
    .select({
      integrationId: integrationOpenaiCompatibleModel.integrationId,
      workspaceId: integrationOpenaiCompatibleModel.workspaceId,
      authRaw: integrationOpenaiCompatibleModel.auth,
      createdAt: integrationOpenaiCompatibleModel.createdAt,
      cursorId: integrationOpenaiCompatibleModel.id,
      baseURL: integrationOpenaiCompatibleModel.baseURL,
      name: integrationOpenaiCompatibleModel.name,
    })
    .from(rawTable)
    .where(
      and(
        workspaceId
          ? eq(integrationOpenaiCompatibleModel.workspaceId, workspaceId)
          : undefined,
        cursor ? gt(integrationOpenaiCompatibleModel.id, cursor) : undefined,
      ),
    )
    .orderBy(asc(integrationOpenaiCompatibleModel.id))
    .limit(limit)
  const candidates: Candidate[] = rows.map((row) => ({
    provider: "openaiCompatible",
    kind: "integration",
    channel: null,
    workspaceId: row.workspaceId,
    inboxId: null,
    integrationId: row.integrationId,
    sourceId: row.baseURL,
    displayName: row.name,
    status: "connected",
    statusReason: null,
    disconnectedAt: null,
    authExpiresAt: authExpiresAtOf(row.authRaw),
    connectedAt: row.createdAt,
    legacyNeedsReauthHeuristic: false,
  }))
  return { candidates, nextCursor: rows.at(-1)?.cursorId ?? null }
}

// ---------------------------------------------------------------------------
// Provider registries
// ---------------------------------------------------------------------------

const CHANNEL_FETCHERS: Partial<Record<IntegrationType, BatchFetcher>> = {
  messenger: fetchMessengerBatch,
  instagram: fetchInstagramVariant("instagram", "instagram"),
  instagramFacebook: fetchInstagramVariant("instagramFacebook", "facebook"),
  whatsapp: fetchWhatsappBatch,
  telegram: fetchTelegramBatch,
  tiktok: fetchTiktokBatch,
  zalo: fetchZaloBatch,
  api: fetchApiBatch,
  smtp: fetchSmtpBatch,
  webchat: fetchWebchatBatch,
}

const PROVIDER_CHANNEL: Partial<Record<IntegrationType, ChannelType>> = {
  messenger: "messenger",
  instagram: "instagram",
  instagramFacebook: "instagram",
  whatsapp: "whatsapp",
  telegram: "telegram",
  tiktok: "tiktok",
  zalo: "zalo",
  api: "api",
  smtp: "smtp",
  webchat: "webchat",
}

const INTEGRATION_FETCHERS: Partial<Record<IntegrationType, BatchFetcher>> = {
  activeCampaign: makeWorkspaceSingletonFetcher(
    "activeCampaign",
    integrationActiveCampaignModel,
    INTEGRATION_DISPLAY_NAMES.activeCampaign,
  ),
  claude: makeWorkspaceSingletonFetcher(
    "claude",
    integrationClaudeModel,
    INTEGRATION_DISPLAY_NAMES.claude,
  ),
  deepseek: makeWorkspaceSingletonFetcher(
    "deepseek",
    integrationDeepseekModel,
    INTEGRATION_DISPLAY_NAMES.deepseek,
  ),
  drip: makeWorkspaceSingletonFetcher(
    "drip",
    integrationDripModel,
    INTEGRATION_DISPLAY_NAMES.drip,
  ),
  gemini: makeWorkspaceSingletonFetcher(
    "gemini",
    integrationGeminiModel,
    INTEGRATION_DISPLAY_NAMES.gemini,
  ),
  getResponse: makeWorkspaceSingletonFetcher(
    "getResponse",
    integrationGetResponseModel,
    INTEGRATION_DISPLAY_NAMES.getResponse,
  ),
  klaviyo: makeWorkspaceSingletonFetcher(
    "klaviyo",
    integrationKlaviyoModel,
    INTEGRATION_DISPLAY_NAMES.klaviyo,
  ),
  mailchimp: makeWorkspaceSingletonFetcher(
    "mailchimp",
    integrationMailchimpModel,
    INTEGRATION_DISPLAY_NAMES.mailchimp,
  ),
  mailerLite: makeWorkspaceSingletonFetcher(
    "mailerLite",
    integrationMailerLiteModel,
    INTEGRATION_DISPLAY_NAMES.mailerLite,
  ),
  moosend: makeWorkspaceSingletonFetcher(
    "moosend",
    integrationMoosendModel,
    INTEGRATION_DISPLAY_NAMES.moosend,
  ),
  openai: makeWorkspaceSingletonFetcher(
    "openai",
    integrationOpenaiModel,
    INTEGRATION_DISPLAY_NAMES.openai,
  ),
  openrouter: makeWorkspaceSingletonFetcher(
    "openrouter",
    integrationOpenrouterModel,
    INTEGRATION_DISPLAY_NAMES.openrouter,
  ),
  sendGrid: makeWorkspaceSingletonFetcher(
    "sendGrid",
    integrationSendGridModel,
    INTEGRATION_DISPLAY_NAMES.sendGrid,
  ),
  facebookAds: fetchFacebookAdsBatch,
  googleCalendar: fetchGoogleCalendarBatch,
  googleSheets: fetchGoogleSheetsBatch,
  openaiCompatible: fetchOpenaiCompatibleBatch,
}

export const SKIPPED_PROVIDERS: IntegrationType[] = [
  "threads",
  "metaCatalog",
  "outlookCalendar",
  "chatbotx",
]

const ALL_HANDLED_PROVIDERS: IntegrationType[] = [
  ...(Object.keys(CHANNEL_FETCHERS) as IntegrationType[]),
  ...(Object.keys(INTEGRATION_FETCHERS) as IntegrationType[]),
]

const toInsertValues = (
  candidate: Candidate,
): typeof connectionModel.$inferInsert => ({
  workspaceId: candidate.workspaceId,
  provider: candidate.provider,
  kind: candidate.kind,
  channel: candidate.channel,
  inboxId: candidate.inboxId,
  integrationId: candidate.integrationId,
  sourceId: candidate.sourceId,
  displayName: candidate.displayName,
  status: candidate.status,
  statusReason: candidate.statusReason,
  authExpiresAt: candidate.authExpiresAt,
  createdBy: null,
  connectedAt: candidate.connectedAt,
  disconnectedAt: candidate.disconnectedAt,
})

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

const processProvider = async (
  client: DatabaseClient,
  provider: IntegrationType,
  fetcher: BatchFetcher,
  opts: { workspaceId?: string; dryRun: boolean },
): Promise<{
  stat: ProviderStat
  conflicts: BackfillConflict[]
  sample: Candidate[]
}> => {
  const stat: ProviderStat = { provider, scanned: 0, inserted: 0 }
  const conflicts: BackfillConflict[] = []
  const sample: Candidate[] = []
  // `(workspaceId, sourceId)` -> occurrence count, across every batch for this
  // provider — a count > 1 means two distinct source rows would race for the
  // same `(workspaceId, provider, sourceId)` unique key.
  const seenKeys = new Map<
    string,
    { workspaceId: string; sourceId: string; count: number }
  >()
  // In --dry-run, keys already counted as "would insert" so a duplicate
  // source row spanning two batches isn't double-counted.
  const countedKeys = new Set<string>()
  const zaloWorkspacesByOaId =
    provider === "zalo" ? new Map<string, Set<string>>() : null
  let legacyNeedsReauthCount = 0
  let cursor: string | null = null

  for (;;) {
    const { candidates, nextCursor } = await fetcher(client, {
      workspaceId: opts.workspaceId,
      cursor,
      limit: BATCH_SIZE,
    })
    if (candidates.length === 0) {
      break
    }
    stat.scanned += candidates.length

    for (const candidate of candidates) {
      const key = `${candidate.workspaceId}\u0000${candidate.sourceId}`
      const existingEntry = seenKeys.get(key)
      seenKeys.set(key, {
        workspaceId: candidate.workspaceId,
        sourceId: candidate.sourceId,
        count: (existingEntry?.count ?? 0) + 1,
      })
      if (candidate.legacyNeedsReauthHeuristic) {
        legacyNeedsReauthCount += 1
      }
      if (zaloWorkspacesByOaId) {
        const workspaces =
          zaloWorkspacesByOaId.get(candidate.sourceId) ?? new Set<string>()
        workspaces.add(candidate.workspaceId)
        zaloWorkspacesByOaId.set(candidate.sourceId, workspaces)
      }
      if (sample.length < SAMPLE_SIZE) {
        sample.push(candidate)
      }
    }

    if (opts.dryRun) {
      // Read-only "would insert" estimate: a key already present in
      // `Connection`, or already counted from an earlier batch, doesn't add
      // to the count.
      const sourceIds = [...new Set(candidates.map((c) => c.sourceId))]
      const existingRows = await client
        .select({
          workspaceId: connectionModel.workspaceId,
          sourceId: connectionModel.sourceId,
        })
        .from(connectionModel)
        .where(
          and(
            eq(connectionModel.provider, provider),
            inArray(connectionModel.sourceId, sourceIds),
          ),
        )
      const existingKeys = new Set(
        existingRows.map((row) => `${row.workspaceId}\u0000${row.sourceId}`),
      )
      for (const candidate of candidates) {
        const key = `${candidate.workspaceId}\u0000${candidate.sourceId}`
        if (existingKeys.has(key) || countedKeys.has(key)) {
          continue
        }
        countedKeys.add(key)
        stat.inserted += 1
      }
    } else {
      await client.transaction(async (batchTx) => {
        const inserted = await batchTx
          .insert(connectionModel)
          .values(candidates.map(toInsertValues))
          .onConflictDoNothing({
            target: [
              connectionModel.workspaceId,
              connectionModel.provider,
              connectionModel.sourceId,
            ],
          })
          .returning({ id: connectionModel.id })
        stat.inserted += inserted.length
      })
    }

    if (!nextCursor) {
      break
    }
    cursor = nextCursor
  }

  for (const { workspaceId, sourceId, count } of seenKeys.values()) {
    if (count > 1) {
      conflicts.push({
        kind: "duplicate_source_inbox",
        provider,
        workspaceId,
        sourceId,
        detail: `${count} source rows in workspace ${workspaceId} map to the same (provider=${provider}, sourceId=${sourceId}) Connection key; only one can win the unique constraint — the rest are skipped by ON CONFLICT DO NOTHING.`,
      })
    }
  }
  if (zaloWorkspacesByOaId) {
    for (const [oaId, workspaces] of zaloWorkspacesByOaId) {
      if (workspaces.size > 1) {
        conflicts.push({
          kind: "duplicate_zalo_oaid",
          provider: "zalo",
          sourceId: oaId,
          detail: `Zalo oaId ${oaId} is connected from ${workspaces.size} different workspaces (${[...workspaces].join(", ")}) — IntegrationZalo has no unique constraint on oaId, unlike every other channel's identity column.`,
        })
      }
    }
  }
  if (legacyNeedsReauthCount > 0) {
    conflicts.push({
      kind: "legacy_needs_reauth_heuristic",
      provider,
      detail: `${legacyNeedsReauthCount} needs_reauth candidate(s) for ${provider} have Inbox.disconnectReason = NULL (rather than the explicit 'token_revoked' value). Heuristic: a NULL reason on a disconnected inbox most likely came from a legacy disconnect/markOffline call that predates reason-recording, so it is mapped to needs_reauth/token_revoked like an explicit token_revoked row — but the original cause can't be verified from the data alone.`,
    })
  }

  return { stat, conflicts, sample }
}

const runVerify = async (
  client: DatabaseClient,
  options: { provider?: IntegrationType; workspaceId?: string },
): Promise<VerifyCounts> => {
  const providers = options.provider
    ? [options.provider]
    : ALL_HANDLED_PROVIDERS
  const channelProviders = providers.filter((p) => CHANNEL_FETCHERS[p])
  const integrationProviders = providers.filter((p) => INTEGRATION_FETCHERS[p])
  const handledChannelTypes = [
    ...new Set(channelProviders.map((p) => PROVIDER_CHANNEL[p] as ChannelType)),
  ]

  const channelInboxesMissingConnection =
    handledChannelTypes.length === 0
      ? 0
      : ((
          await client
            .select({ count: sql<number>`count(*)::int` })
            .from(inboxModel)
            .leftJoin(
              connectionModel,
              eq(connectionModel.inboxId, inboxModel.id),
            )
            .where(
              and(
                inArray(inboxModel.channel, handledChannelTypes),
                isNull(connectionModel.id),
                options.workspaceId
                  ? eq(inboxModel.workspaceId, options.workspaceId)
                  : undefined,
              ),
            )
        )[0]?.count ?? 0)

  const integrationsMissingConnection =
    integrationProviders.length === 0
      ? 0
      : ((
          await client
            .select({ count: sql<number>`count(*)::int` })
            .from(integrationModel)
            .leftJoin(
              connectionModel,
              eq(connectionModel.integrationId, integrationModel.id),
            )
            .where(
              and(
                inArray(integrationModel.integrationType, integrationProviders),
                isNull(connectionModel.id),
                options.workspaceId
                  ? eq(integrationModel.workspaceId, options.workspaceId)
                  : undefined,
              ),
            )
        )[0]?.count ?? 0)

  let statusMismatches = 0
  for (const provider of [...channelProviders, ...integrationProviders]) {
    const fetcher = CHANNEL_FETCHERS[provider] ?? INTEGRATION_FETCHERS[provider]
    if (!fetcher) {
      continue
    }
    let cursor: string | null = null
    for (;;) {
      const { candidates, nextCursor } = await fetcher(client, {
        workspaceId: options.workspaceId,
        cursor,
        limit: BATCH_SIZE,
      })
      if (candidates.length === 0) {
        break
      }
      const fkIds = candidates
        .map((c) => c.inboxId ?? c.integrationId)
        .filter((v): v is string => v != null)
      if (fkIds.length > 0) {
        const isChannel = candidates[0].kind === "channel"
        const existingRows = await client
          .select({
            inboxId: connectionModel.inboxId,
            integrationId: connectionModel.integrationId,
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
        const byFk = new Map(
          existingRows.map((row) => [
            (row.inboxId ?? row.integrationId) as string,
            row,
          ]),
        )
        for (const candidate of candidates) {
          const fk = candidate.inboxId ?? candidate.integrationId
          if (!fk) {
            continue
          }
          const existing = byFk.get(fk)
          if (!existing) {
            // Already surfaced by the missing-connection counts above.
            continue
          }
          const disconnectedAtAgrees =
            (existing.disconnectedAt === null) ===
            (candidate.disconnectedAt === null)
          if (
            existing.status !== candidate.status ||
            existing.statusReason !== candidate.statusReason ||
            !disconnectedAtAgrees
          ) {
            statusMismatches += 1
          }
        }
      }
      if (!nextCursor) {
        break
      }
      cursor = nextCursor
    }
  }

  return {
    channelInboxesMissingConnection,
    integrationsMissingConnection,
    statusMismatches,
  }
}

export const backfillConnections = async (
  client: DatabaseClient,
  options: BackfillConnectionsOptions = {},
): Promise<BackfillConnectionsResult> => {
  if (
    options.provider &&
    !integrationTypes.safeParse(options.provider).success
  ) {
    throw new Error(
      `Unknown --provider value "${options.provider}". Valid values: ${integrationTypes.options.join(", ")}`,
    )
  }

  if (options.verify) {
    return {
      dryRun: options.dryRun ?? false,
      counts: [],
      totalInserted: 0,
      conflicts: [],
      sample: [],
      verify: await runVerify(client, {
        provider: options.provider,
        workspaceId: options.workspaceId,
      }),
    }
  }

  const dryRun = options.dryRun ?? false
  const providers = options.provider
    ? [options.provider]
    : ALL_HANDLED_PROVIDERS

  const counts: ProviderStat[] = []
  const conflicts: BackfillConflict[] = []
  const sample: Candidate[] = []

  for (const provider of providers) {
    const fetcher = CHANNEL_FETCHERS[provider] ?? INTEGRATION_FETCHERS[provider]
    if (!fetcher) {
      // Not eligible for backfill (one of `SKIPPED_PROVIDERS`, or an
      // unrecognised string when called programmatically).
      continue
    }
    const result = await processProvider(client, provider, fetcher, {
      workspaceId: options.workspaceId,
      dryRun,
    })
    counts.push(result.stat)
    conflicts.push(...result.conflicts)
    for (const candidate of result.sample) {
      if (sample.length < SAMPLE_SIZE) {
        sample.push(candidate)
      }
    }
  }

  return {
    dryRun,
    counts,
    totalInserted: counts.reduce((sum, stat) => sum + stat.inserted, 0),
    conflicts,
    sample,
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const parseArgs = (argv: string[]): BackfillConnectionsOptions => {
  const dryRun = argv.includes("--dry-run")
  const verify = argv.includes("--verify")
  const providerArg = argv
    .find((arg) => arg.startsWith("--provider="))
    ?.slice("--provider=".length)
  const workspaceArg = argv
    .find((arg) => arg.startsWith("--workspace="))
    ?.slice("--workspace=".length)
  if (providerArg && !integrationTypes.safeParse(providerArg).success) {
    throw new Error(
      `Unknown --provider value "${providerArg}". Valid values: ${integrationTypes.options.join(", ")}`,
    )
  }
  return {
    dryRun,
    verify,
    provider: providerArg as IntegrationType | undefined,
    workspaceId: workspaceArg,
  }
}

const printResult = (result: BackfillConnectionsResult): void => {
  if (result.verify) {
    console.log("Verify results (all three must be 0):")
    console.log(
      `  Inbox rows missing a Connection row: ${result.verify.channelInboxesMissingConnection}`,
    )
    console.log(
      `  Integration rows missing a Connection row: ${result.verify.integrationsMissingConnection}`,
    )
    console.log(
      `  Connection rows with a status mismatch: ${result.verify.statusMismatches}`,
    )
    return
  }

  console.log(
    `Backfill ${result.dryRun ? "(dry run, no writes)" : ""} — per-provider counts:`,
  )
  for (const stat of result.counts) {
    console.log(
      `  ${stat.provider}: scanned=${stat.scanned} ${result.dryRun ? "would-insert" : "inserted"}=${stat.inserted}`,
    )
  }
  console.log(
    `Total ${result.dryRun ? "would-insert" : "inserted"}: ${result.totalInserted}`,
  )

  if (result.conflicts.length > 0) {
    console.log(
      `\nConflicts (${result.conflicts.length}) — reported, not auto-fixed:`,
    )
    for (const conflict of result.conflicts) {
      const workspacePart = conflict.workspaceId
        ? ` workspace=${conflict.workspaceId}`
        : ""
      const sourcePart = conflict.sourceId
        ? ` sourceId=${conflict.sourceId}`
        : ""
      console.log(
        `  [${conflict.kind}] ${conflict.provider}${workspacePart}${sourcePart}: ${conflict.detail}`,
      )
    }
  }

  if (result.dryRun && result.sample.length > 0) {
    console.log(`\nSample candidates (up to ${SAMPLE_SIZE}):`)
    for (const candidate of result.sample) {
      console.log(`  ${JSON.stringify(candidate)}`)
    }
  }
}

const main = async (): Promise<void> => {
  const options = parseArgs(process.argv.slice(2))
  const result = await backfillConnections(db, options)
  printResult(result)
}

// Only auto-run when executed directly (`tsx scripts/backfill-connections.ts`),
// never when another module (e.g. the integration test) imports
// `backfillConnections` from this file.
const isMainModule =
  process.argv[1] === new URL(import.meta.url).pathname ||
  process.argv[1] === import.meta.url

if (isMainModule) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("Connections backfill failed:", error)
      process.exit(1)
    })
}
