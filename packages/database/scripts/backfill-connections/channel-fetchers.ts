import { and, asc, eq, gt, type SQL, sql } from "drizzle-orm"
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core"
import type { ChannelType, IntegrationType } from "../../src/partials"
import {
  inboxModel,
  integrationApiModel,
  integrationInstagramModel,
  integrationMessengerModel,
  integrationSmtpModel,
  integrationTelegramModel,
  integrationThreadsModel,
  integrationTiktokModel,
  integrationWebchatModel,
  integrationWhatsappModel,
  integrationZaloModel,
} from "../../src/schema"
import { metadataString, parseOauth2Auth, toChannelCandidate } from "./status"
import type { BatchFetcher } from "./types"

// ---------------------------------------------------------------------------
// Channel-provider fetchers (kind: "channel", keyed off `Inbox.id`)
// ---------------------------------------------------------------------------

type ChannelSatelliteTable = PgTable & {
  inboxId: AnyPgColumn
  auth: AnyPgColumn
}

type ChannelFetcherConfig<TTable extends ChannelSatelliteTable> = {
  channel: ChannelType
  provider: IntegrationType
  satellite: TTable
  sourceIdCol: AnyPgColumn
  nameCol: AnyPgColumn | SQL<string | null>
  tokenErrCol: AnyPgColumn | SQL<string | null>
  label: string | ((row: { name: string | null; authRaw: unknown }) => string)
}

/** Literal NULL placeholder for a channel satellite with no name/tokenRefreshError column of its own (e.g. Telegram's static bot token has no OAuth refresh cycle). */
const NO_COLUMN = sql<string | null>`NULL`

/**
 * Factory for the common "one Inbox x one satellite row" channel fetcher
 * shape — join `Inbox` to `satellite` by `inboxId`, filter by `channel`,
 * keyset-paginate on `Inbox.id` — modelled on `makeWorkspaceSingletonFetcher`
 * in `integration-fetchers.ts`. Covers every channel whose identity/name/
 * token-error columns are plain satellite columns; `instagram`/
 * `instagramFacebook` (extra `type` filter) and `whatsapp` (two-column name
 * fallback) don't fit this shape and keep their own fetchers below.
 */
const makeChannelFetcher = <TTable extends ChannelSatelliteTable>({
  channel,
  provider,
  satellite,
  sourceIdCol,
  nameCol,
  tokenErrCol,
  label,
}: ChannelFetcherConfig<TTable>): BatchFetcher => {
  const rawSatellite: PgTable = satellite
  return async (client, { workspaceId, cursor, limit }) => {
    const rows = await client
      .select({
        inboxId: inboxModel.id,
        workspaceId: inboxModel.workspaceId,
        inboxStatus: inboxModel.status,
        disconnectReason: inboxModel.disconnectReason,
        disconnectedAt: inboxModel.disconnectedAt,
        createdAt: inboxModel.createdAt,
        sourceId: sourceIdCol,
        name: nameCol,
        authRaw: satellite.auth,
        tokenRefreshError: tokenErrCol,
      })
      .from(inboxModel)
      .innerJoin(rawSatellite, eq(satellite.inboxId, inboxModel.id))
      .where(
        and(
          eq(inboxModel.channel, channel),
          workspaceId ? eq(inboxModel.workspaceId, workspaceId) : undefined,
          cursor ? gt(inboxModel.id, cursor) : undefined,
        ),
      )
      .orderBy(asc(inboxModel.id))
      .limit(limit)
    const candidates = rows.map((row) => {
      const name = row.name as string | null
      const displayName =
        typeof label === "function"
          ? label({ name, authRaw: row.authRaw })
          : name || label
      return toChannelCandidate(
        provider,
        channel,
        {
          inboxId: row.inboxId,
          workspaceId: row.workspaceId,
          inboxStatus: row.inboxStatus,
          disconnectReason: row.disconnectReason,
          disconnectedAt: row.disconnectedAt,
          createdAt: row.createdAt,
          sourceId: row.sourceId as string,
          authRaw: row.authRaw,
          tokenRefreshError: row.tokenRefreshError as string | null,
        },
        displayName,
      )
    })
    return { candidates, nextCursor: rows.at(-1)?.inboxId ?? null }
  }
}

const fetchMessengerBatch = makeChannelFetcher({
  channel: "messenger",
  provider: "messenger",
  satellite: integrationMessengerModel,
  sourceIdCol: integrationMessengerModel.pageId,
  nameCol: integrationMessengerModel.name,
  tokenErrCol: integrationMessengerModel.tokenRefreshError,
  label: "Messenger",
})

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

// Telegram bot tokens are static (no OAuth refresh cycle); this channel has
// no `name` or `tokenRefreshError` column of its own.
const fetchTelegramBatch = makeChannelFetcher({
  channel: "telegram",
  provider: "telegram",
  satellite: integrationTelegramModel,
  sourceIdCol: integrationTelegramModel.botId,
  nameCol: NO_COLUMN,
  tokenErrCol: NO_COLUMN,
  label: "Telegram bot",
})

const fetchTiktokBatch = makeChannelFetcher({
  channel: "tiktok",
  provider: "tiktok",
  satellite: integrationTiktokModel,
  sourceIdCol: integrationTiktokModel.openId,
  nameCol: integrationTiktokModel.name,
  tokenErrCol: integrationTiktokModel.tokenRefreshError,
  // `name` is TikTok's connect-time `display_name`; `Inbox.sourceId` (not
  // used here) holds `username` instead. Fall back to
  // `auth.metadata.username` for the rare legacy row where `name` came back
  // empty.
  label: (row) =>
    row.name ||
    metadataString(parseOauth2Auth(row.authRaw), "username") ||
    "TikTok",
})

const fetchZaloBatch = makeChannelFetcher({
  channel: "zalo",
  provider: "zalo",
  satellite: integrationZaloModel,
  sourceIdCol: integrationZaloModel.oaId,
  nameCol: integrationZaloModel.name,
  tokenErrCol: integrationZaloModel.tokenRefreshError,
  label: "Zalo OA",
})

const fetchThreadsBatch = makeChannelFetcher({
  channel: "threads",
  provider: "threads",
  satellite: integrationThreadsModel,
  sourceIdCol: integrationThreadsModel.threadsUserId,
  nameCol: integrationThreadsModel.name,
  tokenErrCol: integrationThreadsModel.tokenRefreshError,
  label: "Threads",
})

const fetchApiBatch = makeChannelFetcher({
  channel: "api",
  provider: "api",
  satellite: integrationApiModel,
  sourceIdCol: integrationApiModel.id,
  nameCol: integrationApiModel.name,
  tokenErrCol: NO_COLUMN,
  label: "API",
})

const fetchSmtpBatch = makeChannelFetcher({
  channel: "smtp",
  provider: "smtp",
  satellite: integrationSmtpModel,
  sourceIdCol: integrationSmtpModel.id,
  nameCol: integrationSmtpModel.name,
  tokenErrCol: NO_COLUMN,
  label: "SMTP",
})

const fetchWebchatBatch = makeChannelFetcher({
  channel: "webchat",
  provider: "webchat",
  satellite: integrationWebchatModel,
  sourceIdCol: integrationWebchatModel.id,
  nameCol: integrationWebchatModel.name,
  tokenErrCol: NO_COLUMN,
  label: "Webchat",
})

// ---------------------------------------------------------------------------
// Provider registries (channel side)
// ---------------------------------------------------------------------------

export const CHANNEL_FETCHERS: Partial<Record<IntegrationType, BatchFetcher>> =
  {
    messenger: fetchMessengerBatch,
    instagram: fetchInstagramVariant("instagram", "instagram"),
    instagramFacebook: fetchInstagramVariant("instagramFacebook", "facebook"),
    whatsapp: fetchWhatsappBatch,
    telegram: fetchTelegramBatch,
    tiktok: fetchTiktokBatch,
    zalo: fetchZaloBatch,
    threads: fetchThreadsBatch,
    api: fetchApiBatch,
    smtp: fetchSmtpBatch,
    webchat: fetchWebchatBatch,
  }

export const PROVIDER_CHANNEL: Partial<Record<IntegrationType, ChannelType>> = {
  messenger: "messenger",
  instagram: "instagram",
  instagramFacebook: "instagram",
  whatsapp: "whatsapp",
  telegram: "telegram",
  tiktok: "tiktok",
  zalo: "zalo",
  threads: "threads",
  api: "api",
  smtp: "smtp",
  webchat: "webchat",
}

/**
 * Every handled channel's satellite table, keyed by `Inbox.channel` (not
 * provider — `instagram` and `instagramFacebook` share both the channel
 * value AND this satellite table, split only by `IntegrationInstagram.type`).
 * Lets `runVerify` tell "no Connection row because the backfill hasn't run
 * yet" apart from "no Connection row because there is nothing to even read"
 * (a channel-type Inbox with no satellite row at all — orphaned legacy data
 * the backfill can never fix, reported only as `channelInboxesWithNoSatellite`).
 */
export const CHANNEL_SATELLITE_TABLE: Partial<
  Record<ChannelType, PgTable & { inboxId: AnyPgColumn }>
> = {
  messenger: integrationMessengerModel,
  instagram: integrationInstagramModel,
  whatsapp: integrationWhatsappModel,
  telegram: integrationTelegramModel,
  tiktok: integrationTiktokModel,
  zalo: integrationZaloModel,
  threads: integrationThreadsModel,
  api: integrationApiModel,
  smtp: integrationSmtpModel,
  webchat: integrationWebchatModel,
}
