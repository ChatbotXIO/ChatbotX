import { and, asc, eq, gt } from "drizzle-orm"
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core"
import type { IntegrationType } from "../../src/partials"
import {
  integrationActiveCampaignModel,
  integrationClaudeModel,
  integrationDeepseekModel,
  integrationDripModel,
  integrationFacebookAdsModel,
  integrationGeminiModel,
  integrationGetResponseModel,
  integrationGoogleCalendarModel,
  integrationGoogleSheetsModel,
  integrationKlaviyoModel,
  integrationMailchimpModel,
  integrationMailerLiteModel,
  integrationMoosendModel,
  integrationOpenaiCompatibleModel,
  integrationOpenaiModel,
  integrationOpenrouterModel,
  integrationSendGridModel,
} from "../../src/schema"
import { authExpiresAtOf, metadataString, parseOauth2Auth } from "./status"
import type { BatchFetcher, Candidate } from "./types"

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

export const INTEGRATION_FETCHERS: Partial<
  Record<IntegrationType, BatchFetcher>
> = {
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
