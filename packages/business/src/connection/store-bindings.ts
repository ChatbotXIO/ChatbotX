import type { DatabaseClient } from "@chatbotx.io/database/client"
import { db, eq } from "@chatbotx.io/database/client"
import type { IntegrationType } from "@chatbotx.io/database/partials"
import {
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
  integrationMetaCatalogModel,
  integrationModel,
  integrationMoosendModel,
  integrationOpenaiCompatibleModel,
  integrationOpenaiModel,
  integrationOpenrouterModel,
  integrationOutlookCalendarModel,
  integrationSendGridModel,
  integrationSmtpModel,
  integrationTelegramModel,
  integrationTiktokModel,
  integrationWebchatModel,
  integrationWhatsappModel,
  integrationZaloModel,
} from "@chatbotx.io/database/schema"
import type { AuthValue } from "@chatbotx.io/sdk"
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core"

/** Minimal shape a binding's DB row is normalized to. */
export type ConnectionStoreRow = {
  id: string
  inboxId?: string | null
  integrationId?: string | null
  auth: AuthValue
}

export type ConnectionStoreInsertInput = {
  workspaceId: string
  inboxId?: string
  integrationId?: string
  auth: AuthValue
  descriptor: { sourceId: string; displayName: string }
  config?: Record<string, unknown>
}

/**
 * Per-`IntegrationType` DB adapter the Connection domain drives instead of
 * each channel/integration hand-rolling insert/delete/lookup logic. `table`
 * is the SQL table name (matches `Connection.provider`'s satellite row);
 * `identityColumn` is the column that carries the provider's natural
 * external id (`pageId`, `phoneNumberId`, `botId`, …) — `null` when the row
 * has no external identity beyond its own `id` (api/smtp/webchat).
 */
export type ConnectionStoreBinding = {
  table: string
  identityColumn: string | null
  loadAuth: (rowId: string, tx?: DatabaseClient) => Promise<AuthValue>
  /**
   * Same read as `loadAuth`, keyed by the FK the `Connection` row actually
   * carries (`inboxId` for channels, `integrationId` for workspace
   * integrations) — `Connection` has no column pointing at the satellite
   * row's own primary key, so this is what `ConnectionService` (disconnect/
   * refresh/verify) uses to reach the row.
   */
  loadAuthByForeignKey: (
    foreignKey: string,
    tx?: DatabaseClient,
  ) => Promise<AuthValue>
  /** Persists a refreshed auth value by the same FK as {@link loadAuthByForeignKey} — used by `ConnectionService.refresh`'s `AuthStore.save`. */
  saveAuthByForeignKey: (
    foreignKey: string,
    auth: AuthValue,
    tx?: DatabaseClient,
  ) => Promise<void>
  /**
   * `id` is always the satellite row's own PK. `integrationId` is also
   * populated for a workspace-integration binding (the parent `Integration`
   * row `insertRow` creates in the same transaction) — `Connection` has no
   * column pointing at a satellite's own PK, so `ConnectionService` needs
   * this to set `Connection.integrationId`. `undefined` for a channel
   * binding, whose FK is the caller-supplied `inboxId` it already has.
   */
  insertRow: (
    input: ConnectionStoreInsertInput,
    tx?: DatabaseClient,
  ) => Promise<{ id: string; integrationId?: string }>
  /** `delete_row`: messenger/instagram-style disconnect deletes the satellite row. `keep_row`: whatsapp/zalo/… keep it for reconnect matching (today's behaviour). */
  onDisconnect: "delete_row" | "keep_row"
  /** No-ops when `onDisconnect === "keep_row"`. Same FK as `loadAuthByForeignKey`. */
  deleteRowByForeignKey: (
    foreignKey: string,
    tx?: DatabaseClient,
  ) => Promise<void>
  findRowByIdentifier: (
    identifier: string,
    tx?: DatabaseClient,
  ) => Promise<ConnectionStoreRow | null>
  /** Unique-constraint name a duplicate insert violates — lets callers map it to `alreadyConnected` instead of a raw DB error. */
  duplicateConstraint?: string
}

/**
 * `AnyPgColumn`'s data type is erased to `unknown` by design (it spans every
 * column type in the schema). Every generic binding factory below reads a
 * jsonb `auth`/`encryptedAuth` column through this type, so the cast to
 * `AuthValue` happens once here rather than at each call site — Drizzle has
 * no way to express "this specific dynamic column is jsonb shaped like
 * AuthValue" generically.
 */
const asAuthValue = (value: unknown): AuthValue => value as AuthValue

/**
 * Channel-satellite binding: a table with `id`, `workspaceId`, `inboxId`,
 * `auth`, `name`, and (usually) one natural external identity column. Covers
 * api/messenger/whatsapp/zalo/smtp/telegram/tiktok/webchat and the
 * instagram/instagramFacebook split over `IntegrationInstagram`.
 */
type ChannelSatelliteTable = PgTable & {
  id: AnyPgColumn
  auth: AnyPgColumn
  name: AnyPgColumn
  workspaceId: AnyPgColumn
  inboxId: AnyPgColumn
}

const makeChannelBinding = <TTable extends ChannelSatelliteTable>(opts: {
  table: TTable
  tableName: string
  identityColumn: (Extract<keyof TTable, string> & string) | null
  onDisconnect: "delete_row" | "keep_row"
  duplicateConstraint?: string
  /** Extra fixed columns to set on insert (e.g. `IntegrationInstagram.type`). */
  extraInsertValues?: Record<string, unknown>
  /** Extra equality narrowing every read must apply (e.g. `type = 'instagram'`). */
  extraWhere?: Record<string, AnyPgColumn extends never ? never : unknown>
}): ConnectionStoreBinding => {
  const { table } = opts
  // `.from()`/`.insert()` reject a generic `TTable` param (Drizzle's typing
  // resolves them against the exact table's config, which a shared factory
  // spanning 15 distinct tables cannot express) — upcast once here; column
  // references below stay on the narrowed `table` for real type checking.
  const rawTable: PgTable = table
  // `identityColumn`, when set, is asserted (Phase 0 registration) to name a
  // real text column on `table`; there is no generic way to encode "this
  // string literal names a column of this specific table" across 15 distinct
  // table shapes, so the lookup is a single documented cast.
  const identityCol = opts.identityColumn
    ? (table[opts.identityColumn as keyof TTable] as unknown as AnyPgColumn)
    : null

  return {
    table: opts.tableName,
    identityColumn: opts.identityColumn,
    loadAuth: async (rowId, tx = db) => {
      const [row] = await tx
        .select({ auth: table.auth })
        .from(rawTable)
        .where(eq(table.id, rowId))
        .limit(1)
      if (!row) {
        throw new Error(`Unable to load auth for ${opts.tableName} ${rowId}`)
      }
      return asAuthValue(row.auth)
    },
    loadAuthByForeignKey: async (inboxId, tx = db) => {
      const [row] = await tx
        .select({ auth: table.auth })
        .from(rawTable)
        .where(eq(table.inboxId, inboxId))
        .limit(1)
      if (!row) {
        throw new Error(
          `Unable to load auth for ${opts.tableName} inbox ${inboxId}`,
        )
      }
      return asAuthValue(row.auth)
    },
    saveAuthByForeignKey: async (inboxId, auth, tx = db) => {
      await tx
        .update(rawTable)
        .set({ auth } as never)
        .where(eq(table.inboxId, inboxId))
    },
    insertRow: async (input, tx = db) => {
      const identityValues = identityCol
        ? { [opts.identityColumn as string]: input.descriptor.sourceId }
        : {}
      const values = {
        workspaceId: input.workspaceId,
        inboxId: input.inboxId,
        auth: input.auth,
        name: input.descriptor.displayName,
        ...identityValues,
        ...opts.extraInsertValues,
        ...input.config,
      }
      // Each channel table adds its own extra required/defaulted columns
      // beyond this shared shape (e.g. `IntegrationApi.tokenHash`), so the
      // generic factory cannot express the exact per-table insert type.
      const [row] = await tx
        .insert(rawTable)
        .values(values as never)
        .returning({ id: table.id })
      return { id: row.id as string }
    },
    onDisconnect: opts.onDisconnect,
    deleteRowByForeignKey: async (inboxId, tx = db) => {
      if (opts.onDisconnect === "keep_row") {
        return
      }
      await tx.delete(rawTable).where(eq(table.inboxId, inboxId))
    },
    findRowByIdentifier: async (identifier, tx = db) => {
      if (!identityCol) {
        return null
      }
      const [row] = await tx
        .select({ id: table.id, inboxId: table.inboxId, auth: table.auth })
        .from(rawTable)
        .where(eq(identityCol, identifier))
        .limit(1)
      if (!row) {
        return null
      }
      return {
        id: row.id as string,
        inboxId: row.inboxId as string,
        auth: asAuthValue(row.auth),
      }
    },
    duplicateConstraint: opts.duplicateConstraint,
  }
}

/**
 * Workspace-level satellite binding: `insertRow` creates the parent
 * `Integration` row (`workspaceId`, `integrationType`) and the satellite row
 * in one transaction, mirroring today's per-provider connect actions. These
 * are all singletons (`sourceId = "workspace"`); `identityColumn` is `null`
 * because the natural key is `workspaceId`, not a column on the satellite.
 */
type WorkspaceSatelliteTable = PgTable & {
  id: AnyPgColumn
  workspaceId: AnyPgColumn
  integrationId: AnyPgColumn
}

const makeWorkspaceIntegrationBinding = <
  TTable extends WorkspaceSatelliteTable,
>(opts: {
  table: TTable
  tableName: string
  integrationType: IntegrationType
  authColumn?: "auth" | "encryptedAuth"
  duplicateConstraint?: string
}): ConnectionStoreBinding => {
  const { table } = opts
  // `.from()`/`.insert()` reject a generic `TTable` param — see the same
  // note in `makeChannelBinding` above.
  const rawTable: PgTable = table
  const authColumnName = opts.authColumn ?? "auth"
  // Only `IntegrationMetaCatalog` names its auth column `encryptedAuth`;
  // every other satellite uses `auth`. The generic factory resolves whichever
  // one this table actually has via a single documented cast.
  const authColumn = table[
    authColumnName as keyof TTable
  ] as unknown as AnyPgColumn

  return {
    table: opts.tableName,
    identityColumn: null,
    loadAuth: async (rowId, tx = db) => {
      const [row] = await tx
        .select({ auth: authColumn })
        .from(rawTable)
        .where(eq(table.id, rowId))
        .limit(1)
      if (!row) {
        throw new Error(`Unable to load auth for ${opts.tableName} ${rowId}`)
      }
      return asAuthValue(row.auth)
    },
    loadAuthByForeignKey: async (integrationId, tx = db) => {
      const [row] = await tx
        .select({ auth: authColumn })
        .from(rawTable)
        .where(eq(table.integrationId, integrationId))
        .limit(1)
      if (!row) {
        throw new Error(
          `Unable to load auth for ${opts.tableName} integration ${integrationId}`,
        )
      }
      return asAuthValue(row.auth)
    },
    saveAuthByForeignKey: async (integrationId, auth, tx = db) => {
      await tx
        .update(rawTable)
        .set({ [authColumnName]: auth } as never)
        .where(eq(table.integrationId, integrationId))
    },
    insertRow: async (input, tx) => {
      const run = async (client: DatabaseClient) => {
        const [parent] = await client
          .insert(integrationModel)
          .values({
            workspaceId: input.workspaceId,
            integrationType: opts.integrationType,
          })
          .returning({ id: integrationModel.id })
        const values = {
          workspaceId: input.workspaceId,
          integrationId: parent.id,
          [authColumnName]: input.auth,
          ...input.config,
        }
        // Same per-table shape gap as `makeChannelBinding.insertRow` above.
        const [row] = await client
          .insert(rawTable)
          .values(values as never)
          .returning({ id: table.id })
        return { id: row.id as string, integrationId: parent.id as string }
      }
      return tx ? await run(tx) : await db.transaction((trx) => run(trx))
    },
    onDisconnect: "delete_row",
    deleteRowByForeignKey: async (integrationId, tx = db) => {
      await tx.delete(rawTable).where(eq(table.integrationId, integrationId))
    },
    findRowByIdentifier: async (identifier, tx = db) => {
      // Workspace singletons are located by `workspaceId`, passed as `identifier`.
      const [row] = await tx
        .select({
          id: table.id,
          integrationId: table.integrationId,
          auth: authColumn,
        })
        .from(rawTable)
        .where(eq(table.workspaceId, identifier))
        .limit(1)
      if (!row) {
        return null
      }
      return {
        id: row.id as string,
        integrationId: row.integrationId as string,
        auth: asAuthValue(row.auth),
      }
    },
    duplicateConstraint: opts.duplicateConstraint,
  }
}

export const CONNECTION_STORE_BINDINGS: Record<
  IntegrationType,
  ConnectionStoreBinding | null
> = {
  activeCampaign: makeWorkspaceIntegrationBinding({
    table: integrationActiveCampaignModel,
    tableName: "IntegrationActiveCampaign",
    integrationType: "activeCampaign",
    duplicateConstraint: "IntegrationActiveCampaign_workspaceId_key",
  }),
  api: makeChannelBinding({
    table: integrationApiModel,
    tableName: "IntegrationApi",
    identityColumn: null,
    onDisconnect: "keep_row",
  }),
  chatbotx: null,
  claude: makeWorkspaceIntegrationBinding({
    table: integrationClaudeModel,
    tableName: "IntegrationClaude",
    integrationType: "claude",
    duplicateConstraint: "IntegrationClaude_workspaceId_key",
  }),
  deepseek: makeWorkspaceIntegrationBinding({
    table: integrationDeepseekModel,
    tableName: "IntegrationDeepseek",
    integrationType: "deepseek",
    duplicateConstraint: "IntegrationDeepseek_workspaceId_key",
  }),
  drip: makeWorkspaceIntegrationBinding({
    table: integrationDripModel,
    tableName: "IntegrationDrip",
    integrationType: "drip",
    duplicateConstraint: "IntegrationDrip_workspaceId_key",
  }),
  facebookAds: makeWorkspaceIntegrationBinding({
    table: integrationFacebookAdsModel,
    tableName: "IntegrationFacebookAds",
    integrationType: "facebookAds",
    duplicateConstraint: "IntegrationFacebookAds_workspaceId_key",
  }),
  gemini: makeWorkspaceIntegrationBinding({
    table: integrationGeminiModel,
    tableName: "IntegrationGemini",
    integrationType: "gemini",
    duplicateConstraint: "IntegrationGemini_workspaceId_key",
  }),
  getResponse: makeWorkspaceIntegrationBinding({
    table: integrationGetResponseModel,
    tableName: "IntegrationGetResponse",
    integrationType: "getResponse",
    duplicateConstraint: "IntegrationGetResponse_workspaceId_key",
  }),
  googleCalendar: makeWorkspaceIntegrationBinding({
    table: integrationGoogleCalendarModel,
    tableName: "IntegrationGoogleCalendar",
    integrationType: "googleCalendar",
  }),
  googleSheets: makeWorkspaceIntegrationBinding({
    table: integrationGoogleSheetsModel,
    tableName: "IntegrationGoogleSheet",
    integrationType: "googleSheets",
  }),
  instagram: makeChannelBinding({
    table: integrationInstagramModel,
    tableName: "IntegrationInstagram",
    identityColumn: "igId",
    onDisconnect: "delete_row",
    duplicateConstraint: "IntegrationInstagram_igId_key",
    extraInsertValues: { type: "instagram" },
    extraWhere: { type: "instagram" },
  }),
  instagramFacebook: makeChannelBinding({
    table: integrationInstagramModel,
    tableName: "IntegrationInstagram",
    identityColumn: "igId",
    onDisconnect: "delete_row",
    duplicateConstraint: "IntegrationInstagram_igId_key",
    extraInsertValues: { type: "facebook" },
    extraWhere: { type: "facebook" },
  }),
  klaviyo: makeWorkspaceIntegrationBinding({
    table: integrationKlaviyoModel,
    tableName: "IntegrationKlaviyo",
    integrationType: "klaviyo",
    duplicateConstraint: "IntegrationKlaviyo_workspaceId_key",
  }),
  mailchimp: makeWorkspaceIntegrationBinding({
    table: integrationMailchimpModel,
    tableName: "IntegrationMailchimp",
    integrationType: "mailchimp",
  }),
  mailerLite: makeWorkspaceIntegrationBinding({
    table: integrationMailerLiteModel,
    tableName: "IntegrationMailerLite",
    integrationType: "mailerLite",
    duplicateConstraint: "IntegrationMailerLite_workspaceId_key",
  }),
  messenger: makeChannelBinding({
    table: integrationMessengerModel,
    tableName: "IntegrationMessenger",
    identityColumn: "pageId",
    onDisconnect: "delete_row",
    duplicateConstraint: "IntegrationMessenger_pageId_key",
  }),
  metaCatalog: makeWorkspaceIntegrationBinding({
    table: integrationMetaCatalogModel,
    tableName: "IntegrationMetaCatalog",
    integrationType: "metaCatalog",
    authColumn: "encryptedAuth",
    duplicateConstraint: "IntegrationMetaCatalog_workspaceId_key",
  }),
  moosend: makeWorkspaceIntegrationBinding({
    table: integrationMoosendModel,
    tableName: "IntegrationMoosend",
    integrationType: "moosend",
    duplicateConstraint: "IntegrationMoosend_workspaceId_key",
  }),
  openai: makeWorkspaceIntegrationBinding({
    table: integrationOpenaiModel,
    tableName: "IntegrationOpenai",
    integrationType: "openai",
  }),
  openaiCompatible: makeWorkspaceIntegrationBinding({
    table: integrationOpenaiCompatibleModel,
    tableName: "IntegrationOpenaiCompatible",
    integrationType: "openaiCompatible",
  }),
  openrouter: makeWorkspaceIntegrationBinding({
    table: integrationOpenrouterModel,
    tableName: "IntegrationOpenrouter",
    integrationType: "openrouter",
    duplicateConstraint: "IntegrationOpenrouter_workspaceId_key",
  }),
  outlookCalendar: makeWorkspaceIntegrationBinding({
    table: integrationOutlookCalendarModel,
    tableName: "IntegrationOutlookCalendar",
    integrationType: "outlookCalendar",
  }),
  sendGrid: makeWorkspaceIntegrationBinding({
    table: integrationSendGridModel,
    tableName: "IntegrationSendGrid",
    integrationType: "sendGrid",
    duplicateConstraint: "IntegrationSendGrid_workspaceId_key",
  }),
  smtp: makeChannelBinding({
    table: integrationSmtpModel,
    tableName: "IntegrationSmtp",
    identityColumn: null,
    onDisconnect: "keep_row",
  }),
  telegram: makeChannelBinding({
    table: integrationTelegramModel,
    tableName: "IntegrationTelegram",
    identityColumn: "botId",
    onDisconnect: "keep_row",
    duplicateConstraint: "IntegrationTelegram_botId_key",
  }),
  tiktok: makeChannelBinding({
    table: integrationTiktokModel,
    tableName: "IntegrationTiktok",
    identityColumn: "openId",
    onDisconnect: "keep_row",
    duplicateConstraint: "IntegrationTiktok_openId_key",
  }),
  webchat: makeChannelBinding({
    table: integrationWebchatModel,
    tableName: "IntegrationWebchat",
    identityColumn: null,
    onDisconnect: "keep_row",
  }),
  whatsapp: makeChannelBinding({
    table: integrationWhatsappModel,
    tableName: "IntegrationWhatsapp",
    identityColumn: "phoneNumberId",
    onDisconnect: "keep_row",
    duplicateConstraint: "IntegrationWhatsapp_phoneNumberId_key",
  }),
  zalo: makeChannelBinding({
    table: integrationZaloModel,
    tableName: "IntegrationZalo",
    identityColumn: "oaId",
    onDisconnect: "keep_row",
  }),
}
