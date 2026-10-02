/**
 * Backfills the `Connection` table from every existing channel (`Inbox` +
 * `Integration<Channel>`) and workspace-level integration row. Idempotent —
 * `ON CONFLICT DO NOTHING` (no column target, so it matches a conflict on
 * ANY of the table's unique constraints: `(workspaceId, provider,
 * sourceId)`, `inboxId`, or `integrationId`) means a row that already
 * exists is never touched. This is deliberate, not just "safe to re-run":
 * once the Connection domain is live, `Connection.status` is FSM-managed
 * (`connectionStateService.transition`) and can be `needs_reauth`/`paused`
 * — states this script's `resolveChannelStatus`/`resolveWorkspaceStatus`
 * never produce (they only derive `connected`/`degraded`/`disconnected`
 * from the satellite's own raw fields). An `ON CONFLICT ... DO UPDATE`
 * here would silently regress a real `needs_reauth` connection back to
 * `connected` on every re-run.
 *
 * Usage:
 *   pnpm --filter @chatbotx.io/database backfill:connections -- --dry-run
 *   pnpm --filter @chatbotx.io/database backfill:connections
 *
 * Channel rows: status is `disconnected` when the source `Inbox` is
 * disconnected, `degraded` when the satellite's `tokenRefreshError` is set
 * (channels that track it), else `connected`. `authExpiresAt` comes from
 * `auth->'tokens'->>'expiresAt'` when present (OAuth2 channels only).
 *
 * Workspace-integration rows: `sourceId` is the literal `"workspace"`
 * singleton key. `facebookAds.status = 'invalid'` backfills as `degraded`;
 * `metaCatalog.deletedAt IS NOT NULL` backfills as `disconnected`.
 *
 * `outlookCalendar`/`metaConversions`/`chatbotx` are intentionally absent —
 * no live table (chatbotx) or no shipped feature yet (outlookCalendar) to
 * backfill from.
 */
import { createId } from "@chatbotx.io/utils"
import { sql } from "drizzle-orm"
import { db } from "../src/client"

const isDryRun = process.argv.includes("--dry-run")

type ChannelConfig = {
  provider: string
  channel: string
  table: string
  /** `null` — the channel has no natural external id; the satellite row's own id is the sourceId. */
  identityColumn: string | null
  hasTokenRefreshError: boolean
  /** `IntegrationInstagram` backs both `instagram` and `instagramFacebook`, disambiguated by `type`. */
  typeFilter?: string
}

const CHANNEL_CONFIGS: ChannelConfig[] = [
  {
    provider: "api",
    channel: "api",
    table: "IntegrationApi",
    identityColumn: null,
    hasTokenRefreshError: false,
  },
  {
    provider: "messenger",
    channel: "messenger",
    table: "IntegrationMessenger",
    identityColumn: "pageId",
    hasTokenRefreshError: true,
  },
  {
    provider: "whatsapp",
    channel: "whatsapp",
    table: "IntegrationWhatsapp",
    identityColumn: "phoneNumberId",
    hasTokenRefreshError: true,
  },
  {
    provider: "zalo",
    channel: "zalo",
    table: "IntegrationZalo",
    identityColumn: "oaId",
    hasTokenRefreshError: true,
  },
  {
    provider: "telegram",
    channel: "telegram",
    table: "IntegrationTelegram",
    identityColumn: "botId",
    hasTokenRefreshError: false,
  },
  {
    provider: "tiktok",
    channel: "tiktok",
    table: "IntegrationTiktok",
    identityColumn: "openId",
    hasTokenRefreshError: true,
  },
  {
    provider: "smtp",
    channel: "smtp",
    table: "IntegrationSmtp",
    identityColumn: null,
    hasTokenRefreshError: false,
  },
  {
    provider: "webchat",
    channel: "webchat",
    table: "IntegrationWebchat",
    identityColumn: null,
    hasTokenRefreshError: false,
  },
  {
    provider: "instagram",
    channel: "instagram",
    table: "IntegrationInstagram",
    identityColumn: "igId",
    hasTokenRefreshError: true,
    typeFilter: "instagram",
  },
  {
    provider: "instagramFacebook",
    channel: "instagram",
    table: "IntegrationInstagram",
    identityColumn: "igId",
    hasTokenRefreshError: true,
    typeFilter: "facebook",
  },
]

type WorkspaceConfig = {
  provider: string
  table: string
  authColumn: "auth" | "encryptedAuth"
  displayName: string
  statusColumn?: string
  deletedAtColumn?: string
  /**
   * Overrides the generic `auth->'tokens'->>'expiresAt'` OAuth2 shape.
   * `FacebookAdsAuthValue` is a flat custom shape with `expiresAt` at the
   * top level — `IntegrationFacebookAds` also has this precomputed as a
   * dedicated `tokenExpiresAt` timestamp column, which this points at
   * directly rather than re-deriving from the jsonb `auth` column.
   */
  authExpiresAtColumn?: string
}

const WORKSPACE_CONFIGS: WorkspaceConfig[] = [
  {
    provider: "activeCampaign",
    table: "IntegrationActiveCampaign",
    authColumn: "auth",
    displayName: "ActiveCampaign",
  },
  {
    provider: "drip",
    table: "IntegrationDrip",
    authColumn: "auth",
    displayName: "Drip",
  },
  {
    provider: "getResponse",
    table: "IntegrationGetResponse",
    authColumn: "auth",
    displayName: "GetResponse",
  },
  {
    provider: "klaviyo",
    table: "IntegrationKlaviyo",
    authColumn: "auth",
    displayName: "Klaviyo",
  },
  {
    provider: "mailchimp",
    table: "IntegrationMailchimp",
    authColumn: "auth",
    displayName: "Mailchimp",
  },
  {
    provider: "mailerLite",
    table: "IntegrationMailerLite",
    authColumn: "auth",
    displayName: "MailerLite",
  },
  {
    provider: "moosend",
    table: "IntegrationMoosend",
    authColumn: "auth",
    displayName: "Moosend",
  },
  {
    provider: "sendGrid",
    table: "IntegrationSendGrid",
    authColumn: "auth",
    displayName: "SendGrid",
  },
  {
    provider: "googleCalendar",
    table: "IntegrationGoogleCalendar",
    authColumn: "auth",
    displayName: "Google Calendar",
  },
  {
    provider: "googleSheets",
    table: "IntegrationGoogleSheet",
    authColumn: "auth",
    displayName: "Google Sheets",
  },
  {
    provider: "openai",
    table: "IntegrationOpenai",
    authColumn: "auth",
    displayName: "OpenAI",
  },
  {
    provider: "openaiCompatible",
    table: "IntegrationOpenaiCompatible",
    authColumn: "auth",
    displayName: "OpenAI-compatible",
  },
  {
    provider: "claude",
    table: "IntegrationClaude",
    authColumn: "auth",
    displayName: "Claude",
  },
  {
    provider: "deepseek",
    table: "IntegrationDeepseek",
    authColumn: "auth",
    displayName: "DeepSeek",
  },
  {
    provider: "gemini",
    table: "IntegrationGemini",
    authColumn: "auth",
    displayName: "Gemini",
  },
  {
    provider: "openrouter",
    table: "IntegrationOpenrouter",
    authColumn: "auth",
    displayName: "OpenRouter",
  },
  {
    provider: "facebookAds",
    table: "IntegrationFacebookAds",
    authColumn: "auth",
    displayName: "Facebook Ads",
    statusColumn: "status",
    // `FacebookAdsAuthValue` is a flat custom shape (`expiresAt` at the top
    // level, not nested under `tokens` like the generic OAuth2 shape every
    // other workspace-integration config relies on) — read the table's own
    // precomputed `tokenExpiresAt` column instead.
    authExpiresAtColumn: "tokenExpiresAt",
  },
  {
    provider: "metaCatalog",
    table: "IntegrationMetaCatalog",
    authColumn: "encryptedAuth",
    displayName: "Meta Catalog",
    deletedAtColumn: "deletedAt",
  },
]

type UpsertInput = {
  workspaceId: string
  provider: string
  kind: "channel" | "integration"
  channel: string | null
  inboxId: string | null
  integrationId: string | null
  sourceId: string
  displayName: string
  status: "connected" | "degraded" | "disconnected"
  authExpiresAt: string | null
}

/** Returns `true` when a row was actually inserted — `false` means a row already existed for one of the table's unique constraints and was left untouched (see the module docstring for why that's deliberate). */
const upsertConnection = async (input: UpsertInput): Promise<boolean> => {
  if (isDryRun) {
    return true
  }
  const result = await db.execute(sql`
    INSERT INTO "Connection"
      (id, "workspaceId", provider, kind, channel, "inboxId", "integrationId", "sourceId", "displayName", status, "authExpiresAt", "connectedAt", "disconnectedAt")
    VALUES
      (${createId()}, ${input.workspaceId}, ${input.provider}, ${input.kind}, ${input.channel}, ${input.inboxId}, ${input.integrationId}, ${input.sourceId}, ${input.displayName}, ${input.status},
       ${input.authExpiresAt}::timestamptz,
       CASE WHEN ${input.status} = 'disconnected' THEN NULL ELSE now() END,
       CASE WHEN ${input.status} = 'disconnected' THEN now() ELSE NULL END)
    ON CONFLICT DO NOTHING
    RETURNING id
  `)
  return result.rows.length > 0
}
const resolveChannelStatus = (
  inboxStatus: string,
  tokenRefreshError: string | null,
): UpsertInput["status"] => {
  if (inboxStatus === "disconnected") {
    return "disconnected"
  }
  return tokenRefreshError ? "degraded" : "connected"
}

const resolveWorkspaceStatus = (
  deletedAt: string | null,
  rowStatus: string | null,
): UpsertInput["status"] => {
  if (deletedAt) {
    return "disconnected"
  }
  return rowStatus === "invalid" ? "degraded" : "connected"
}

type BackfillCounts = { scanned: number; inserted: number }

const backfillChannel = async (
  config: ChannelConfig,
): Promise<BackfillCounts> => {
  const identityExpr = config.identityColumn
    ? sql.raw(`sat."${config.identityColumn}"`)
    : sql.raw("sat.id")
  const tokenRefreshErrorExpr = config.hasTokenRefreshError
    ? sql.raw(`sat."tokenRefreshError"`)
    : sql.raw("NULL")
  const typeWhere = config.typeFilter
    ? sql`WHERE sat.type = ${config.typeFilter}`
    : sql``

  const result = await db.execute<{
    satid: string
    workspaceId: string
    inboxId: string
    name: string
    sourceid: string
    tokenrefresherror: string | null
    inboxstatus: string
    authexpiresat: string | null
  }>(sql`
    SELECT
      sat.id AS "satid",
      sat."workspaceId" AS "workspaceId",
      sat."inboxId" AS "inboxId",
      sat.name AS "name",
      ${identityExpr} AS "sourceid",
      ${tokenRefreshErrorExpr} AS "tokenrefresherror",
      inbox.status AS "inboxstatus",
      sat.auth->'tokens'->>'expiresAt' AS "authexpiresat"
    FROM ${sql.identifier(config.table)} sat
    JOIN "Inbox" inbox ON inbox.id = sat."inboxId"
    ${typeWhere}
  `)

  let inserted = 0
  for (const row of result.rows) {
    const status = resolveChannelStatus(row.inboxstatus, row.tokenrefresherror)

    if (
      await upsertConnection({
        workspaceId: row.workspaceId,
        provider: config.provider,
        kind: "channel",
        channel: config.channel,
        inboxId: row.inboxId,
        integrationId: null,
        sourceId: row.sourceid,
        displayName: row.name,
        status,
        authExpiresAt: row.authexpiresat,
      })
    ) {
      inserted++
    }
  }
  return { scanned: result.rows.length, inserted }
}

const backfillWorkspaceIntegration = async (
  config: WorkspaceConfig,
): Promise<BackfillCounts> => {
  const authExpr = sql.raw(`sat."${config.authColumn}"`)
  const statusExpr = config.statusColumn
    ? sql.raw(`sat."${config.statusColumn}"`)
    : sql`NULL`
  const deletedAtExpr = config.deletedAtColumn
    ? sql.raw(`sat."${config.deletedAtColumn}"`)
    : sql`NULL`
  const authExpiresAtExpr = config.authExpiresAtColumn
    ? sql.raw(`sat."${config.authExpiresAtColumn}"::text`)
    : sql`${authExpr}->'tokens'->>'expiresAt'`

  const result = await db.execute<{
    workspaceId: string
    integrationId: string
    rowstatus: string | null
    deletedat: string | null
    authexpiresat: string | null
  }>(sql`
    SELECT
      sat."workspaceId" AS "workspaceId",
      sat."integrationId" AS "integrationId",
      ${statusExpr} AS "rowstatus",
      ${deletedAtExpr} AS "deletedat",
      ${authExpiresAtExpr} AS "authexpiresat"
    FROM ${sql.identifier(config.table)} sat
  `)

  let inserted = 0
  for (const row of result.rows) {
    const status = resolveWorkspaceStatus(row.deletedat, row.rowstatus)

    if (
      await upsertConnection({
        workspaceId: row.workspaceId,
        provider: config.provider,
        kind: "integration",
        channel: null,
        inboxId: null,
        integrationId: row.integrationId,
        sourceId: "workspace",
        displayName: config.displayName,
        status,
        authExpiresAt: row.authexpiresat,
      })
    ) {
      inserted++
    }
  }
  return { scanned: result.rows.length, inserted }
}

const main = async (): Promise<void> => {
  let totalScanned = 0
  let totalInserted = 0

  for (const config of CHANNEL_CONFIGS) {
    const { scanned, inserted } = await backfillChannel(config)
    totalScanned += scanned
    totalInserted += inserted
    console.log(
      `${config.provider}: ${scanned} row(s) scanned, ${inserted} inserted (${scanned - inserted} already present, left untouched)`,
    )
  }

  for (const config of WORKSPACE_CONFIGS) {
    const { scanned, inserted } = await backfillWorkspaceIntegration(config)
    totalScanned += scanned
    totalInserted += inserted
    console.log(
      `${config.provider}: ${scanned} row(s) scanned, ${inserted} inserted (${scanned - inserted} already present, left untouched)`,
    )
  }

  console.log(
    isDryRun
      ? `Dry run: ${totalScanned} row(s) scanned, ${totalInserted} would be inserted.`
      : `Scanned ${totalScanned} row(s), inserted ${totalInserted} new Connection row(s).`,
  )
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Connection backfill failed:", error)
    process.exit(1)
  })
