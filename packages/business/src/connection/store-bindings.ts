import type { DatabaseClient } from "@chatbotx.io/database/client"
import { and, db, eq } from "@chatbotx.io/database/client"
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
} from "@chatbotx.io/database/schema"
import type { AuthValue } from "@chatbotx.io/sdk"
import type { SQL } from "drizzle-orm"
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core"

type ConnectionStoreInsertInput = {
  workspaceId: string
  inboxId?: string
  integrationId?: string
  auth: AuthValue
  descriptor: { sourceId: string; displayName: string }
  config?: Record<string, unknown>
}

/**
 * Per-`IntegrationType` DB adapter the Connection domain drives instead of
 * each channel/integration hand-rolling insert/delete/lookup logic.
 */
export type ConnectionStoreBinding = {
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
  /**
   * Persists a refreshed auth value by the same FK as
   * {@link loadAuthByForeignKey} — used by `ConnectionService.refresh`'s
   * `AuthStore.save`, by `upsertConnectionRow`'s revive-in-place attempt
   * for a `connectFromCredentials({ allowUpdate: true })` call against an
   * already-active connection, and by `completeReconnect`'s OAuth-reconnect
   * revive attempt. `config`, when given, additionally updates the
   * satellite row's own extra columns through the same `configColumns`
   * allow-list `insertRow` enforces — e.g. replacing an AI provider's
   * `model`/`temperature` alongside its `apiKey` on a PUT update, not just
   * the auth column.
   *
   * Returns whether a row actually matched the FK and was updated — NOT
   * `void`. `Connection.inboxId`/`integrationId` is never cleared when a
   * `delete_row` provider's satellite row is deleted on disconnect (only
   * the satellite row itself goes away), so the stored FK alone can't tell
   * a caller whether a row to update still exists. Both callers above must
   * fall back to `insertRow` when this returns `false` instead of silently
   * no-op-ing a 0-row `UPDATE` and proceeding as if the auth were saved.
   */
  saveAuthByForeignKey: (
    foreignKey: string,
    auth: AuthValue,
    config?: Record<string, unknown>,
    tx?: DatabaseClient,
  ) => Promise<boolean>
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
  deleteRowByForeignKey: (
    foreignKey: string,
    tx?: DatabaseClient,
  ) => Promise<void>
  /** Unique-constraint name a duplicate insert violates — lets callers map it to `alreadyConnected` instead of a raw DB error. */
  duplicateConstraint?: string
  /**
   * Allow-list of extra satellite columns a credential-strategy `connect`
   * request may set via `config` beyond the provider's own `configFields`
   * (e.g. an AI provider's `model`/`temperature`/`maxOutputTokens`).
   * `connectFromCredentials` rejects any `config` key outside this list —
   * without it, a client could set an arbitrary satellite column (e.g.
   * `IntegrationApi.tokenHash`) via `config`. Undefined/empty for every
   * provider whose satellite row carries no additional client-settable
   * column.
   */
  configColumns?: readonly string[]
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

const pickAllowed = (
  config: Record<string, unknown> | undefined,
  configColumns: readonly string[] | undefined,
): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(config ?? {}).filter(([key]) =>
      configColumns?.includes(key),
    ),
  )

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
  /** See `ConnectionStoreBinding.configColumns`. */
  configColumns?: readonly string[]
}): ConnectionStoreBinding => {
  const { table } = opts
  // `.from()`/`.insert()` reject a generic `TTable` param (Drizzle's typing
  // resolves them against the exact table's config, which a shared factory
  // spanning 15 distinct tables cannot express) — upcast once here; column
  // references below stay on the narrowed `table` for real type checking.
  const rawTable: PgTable = table
  // `identityColumn`, when set, is asserted to name a real text column on
  // `table`; there is no generic way to encode this across 15 distinct table
  // shapes, so the lookup uses a single documented cast.
  const identityCol = opts.identityColumn
    ? (table[opts.identityColumn as keyof TTable] as unknown as AnyPgColumn)
    : null
  // Narrows every read/write below to the caller's slice of a shared table
  // (e.g. `IntegrationInstagram.type = 'instagram'` vs `'facebook'`) — without
  // this, instagram and instagramFacebook bindings could load/overwrite/
  // delete each other's rows by `id`/`inboxId` collision on the shared table.
  const extraConditions = (): SQL[] =>
    Object.entries(opts.extraWhere ?? {}).map(([column, value]) =>
      eq(table[column as keyof TTable] as unknown as AnyPgColumn, value),
    )
  const withExtraWhere = (condition: SQL): SQL => {
    const extras = extraConditions()
    return extras.length > 0 ? (and(condition, ...extras) as SQL) : condition
  }

  return {
    loadAuthByForeignKey: async (inboxId, tx = db) => {
      const [row] = await tx
        .select({ auth: table.auth })
        .from(rawTable)
        .where(withExtraWhere(eq(table.inboxId, inboxId)))
        .limit(1)
      if (!row) {
        throw new Error(
          `Unable to load auth for ${opts.tableName} inbox ${inboxId}`,
        )
      }
      return asAuthValue(row.auth)
    },
    saveAuthByForeignKey: async (inboxId, auth, config, tx = db) => {
      const safeConfig = pickAllowed(config, opts.configColumns)
      const updated = await tx
        .update(rawTable)
        .set({ ...safeConfig, auth } as never)
        .where(withExtraWhere(eq(table.inboxId, inboxId)))
        .returning({ id: table.id })
      return updated.length > 0
    },
    insertRow: async (input, tx = db) => {
      const identityValues = identityCol
        ? { [opts.identityColumn as string]: input.descriptor.sourceId }
        : {}
      const safeConfig = pickAllowed(input.config, opts.configColumns)
      // `safeConfig` spreads first so no client-controlled key can clobber
      // the system columns set below — see `ConnectionStoreBinding.configColumns`.
      const values = {
        ...safeConfig,
        ...opts.extraInsertValues,
        workspaceId: input.workspaceId,
        inboxId: input.inboxId,
        auth: input.auth,
        name: input.descriptor.displayName,
        ...identityValues,
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
    deleteRowByForeignKey: async (inboxId, tx = db) => {
      if (opts.onDisconnect === "keep_row") {
        return
      }
      await tx
        .delete(rawTable)
        .where(withExtraWhere(eq(table.inboxId, inboxId)))
    },
    duplicateConstraint: opts.duplicateConstraint,
    configColumns: opts.configColumns,
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
  /** Hydrates an auth value with the stored base URL for endpoint verification. */
  baseUrlColumn?: AnyPgColumn
  /** See `ConnectionStoreBinding.configColumns`. */
  configColumns?: readonly string[]
  /**
   * NOT NULL satellite columns the credential-strategy `connect` request's
   * own `configFields` never supply (e.g. a bare-`apiKey` AI provider's
   * `model`/`maxOutputTokens`) — applied before `safeConfig` so any value
   * the caller DID pass via `config` still wins. A function of the insert
   * input (not a static object) so a default can derive from the
   * connection descriptor (e.g. `openaiCompatible`'s `name` falling back
   * to `descriptor.displayName`).
   */
  defaultConfigValues?: (
    input: ConnectionStoreInsertInput,
  ) => Record<string, unknown>
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
    loadAuthByForeignKey: async (integrationId, tx = db) => {
      const [row] = await tx
        .select(
          opts.baseUrlColumn
            ? { auth: authColumn, baseURL: opts.baseUrlColumn }
            : { auth: authColumn },
        )
        .from(rawTable)
        .where(eq(table.integrationId, integrationId))
        .limit(1)
      if (!row) {
        throw new Error(
          `Unable to load auth for ${opts.tableName} integration ${integrationId}`,
        )
      }
      const auth = asAuthValue(row.auth)
      if (!("baseURL" in row) || typeof row.baseURL !== "string") {
        return auth
      }
      return { ...auth, baseURL: row.baseURL }
    },
    saveAuthByForeignKey: async (integrationId, auth, config, tx = db) => {
      const safeConfig = pickAllowed(config, opts.configColumns)
      const updated = await tx
        .update(rawTable)
        .set({ ...safeConfig, [authColumnName]: auth } as never)
        .where(eq(table.integrationId, integrationId))
        .returning({ id: table.id })
      return updated.length > 0
    },
    insertRow: async (input, tx) => {
      const safeConfig = pickAllowed(input.config, opts.configColumns)
      const run = async (client: DatabaseClient) => {
        const [parent] = await client
          .insert(integrationModel)
          .values({
            workspaceId: input.workspaceId,
            integrationType: opts.integrationType,
          })
          .returning({ id: integrationModel.id })
        // `defaultConfigValues` spreads first (lowest precedence) so a
        // caller-supplied `config` value in `safeConfig` always overrides
        // it; `safeConfig` itself spreads before the system columns below
        // so no client-controlled key can clobber those — see
        // `ConnectionStoreBinding.configColumns`.
        const values = {
          ...opts.defaultConfigValues?.(input),
          ...safeConfig,
          workspaceId: input.workspaceId,
          integrationId: parent.id,
          [authColumnName]: input.auth,
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
    deleteRowByForeignKey: async (integrationId, tx = db) => {
      await tx.delete(rawTable).where(eq(table.integrationId, integrationId))
    },
    duplicateConstraint: opts.duplicateConstraint,
    configColumns: opts.configColumns,
  }
}

/**
 * `model`/`maxOutputTokens` NOT NULL defaults for the five AI-key providers
 * whose credential-strategy `configFields` only declare `apiKey` (see
 * `credential-providers.ts`'s `makeAiKeyProvider`) — without these,
 * `connectFromCredentials({ apiKey })` hits the satellite table's NOT NULL
 * constraint on `model`/`maxOutputTokens` and surfaces as a raw 500. Model
 * ids mirror `packages/ai/src/models/registry.ts`'s `aiChatProviders[...]
 * .defaultModel` (that file's own comment calls it the single source of
 * truth the AI agent model picker and legacy connect dialogs already use)
 * — duplicated as literals rather than imported because `@chatbotx.io/ai`
 * depends on `@chatbotx.io/business`, so importing it back here would be
 * circular. `maxOutputTokens: 1024` matches the `.default(1024)` on the
 * legacy claude/deepseek/gemini/openrouter connect schemas
 * (`apps/builder/src/features/integration-{claude,deepseek,gemini,
 * openrouter}/schema/request.ts`); openai's legacy schema has no default,
 * so 1024 is reused here for consistency across all five providers.
 */
const AI_KEY_PROVIDER_DEFAULTS = {
  claude: { model: "claude-sonnet-4-6", maxOutputTokens: 1024 },
  deepseek: { model: "deepseek-flash", maxOutputTokens: 1024 },
  gemini: { model: "gemini-3.5-flash", maxOutputTokens: 1024 },
  openai: { model: "gpt-5.4-mini", maxOutputTokens: 1024 },
  openrouter: { model: "openai/gpt-5.4-mini", maxOutputTokens: 1024 },
} as const satisfies Record<
  "claude" | "deepseek" | "gemini" | "openai" | "openrouter",
  { model: string; maxOutputTokens: number }
>

const AI_KEY_PROVIDER_CONFIG_COLUMNS = [
  "model",
  "maxOutputTokens",
  "prompt",
  "temperature",
  "autoReply",
] as const

/**
 * `defaultModel`/`preset` NOT NULL defaults for `openaiCompatible`'s
 * credential-strategy connect (`configFields` only declare `apiKey`/
 * `baseURL` — see `credential-providers.ts`'s
 * `openaiCompatibleConnectionProvider`). Values mirror
 * `packages/ai/src/openai-compatible/presets.ts`'s `custom` preset config
 * (`defaultModel: "gpt-4o-mini"`) — the catch-all preset the unique index
 * `IntegrationOpenaiCompatible_workspaceId_preset_key` exempts so a
 * workspace can connect more than one — duplicated as a literal for the
 * same circular-dependency reason as `AI_KEY_PROVIDER_DEFAULTS` above.
 * `name` isn't included here: it falls back to the connection
 * descriptor's `displayName` at the call site, the same pattern
 * `makeChannelBinding.insertRow` already uses for its own `name` column.
 */
const OPENAI_COMPATIBLE_DEFAULTS = {
  defaultModel: "gpt-4o-mini",
  preset: "custom",
} as const

export const CONNECTION_STORE_BINDINGS: Partial<
  Record<IntegrationType, ConnectionStoreBinding | null>
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
    configColumns: AI_KEY_PROVIDER_CONFIG_COLUMNS,
    defaultConfigValues: () => AI_KEY_PROVIDER_DEFAULTS.claude,
  }),
  deepseek: makeWorkspaceIntegrationBinding({
    table: integrationDeepseekModel,
    tableName: "IntegrationDeepseek",
    integrationType: "deepseek",
    duplicateConstraint: "IntegrationDeepseek_workspaceId_key",
    configColumns: AI_KEY_PROVIDER_CONFIG_COLUMNS,
    defaultConfigValues: () => AI_KEY_PROVIDER_DEFAULTS.deepseek,
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
    configColumns: AI_KEY_PROVIDER_CONFIG_COLUMNS,
    defaultConfigValues: () => AI_KEY_PROVIDER_DEFAULTS.gemini,
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
    // OAuth-only (no `fromCredentials`): `candidateToConfig` is
    // developer-derived from `auth`, never client input — see
    // `integrations/instagram/src/integration.ts`.
    configColumns: ["username"],
  }),
  instagramFacebook: makeChannelBinding({
    table: integrationInstagramModel,
    tableName: "IntegrationInstagram",
    identityColumn: "igId",
    onDisconnect: "delete_row",
    duplicateConstraint: "IntegrationInstagram_igId_key",
    extraInsertValues: { type: "facebook" },
    extraWhere: { type: "facebook" },
    // OAuth-only — see `integrations/instagram-facebook/src/integration.ts`.
    configColumns: ["pageId", "username"],
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
    configColumns: [
      ...AI_KEY_PROVIDER_CONFIG_COLUMNS,
      "autoReplyVoice",
      "voice",
    ],
    defaultConfigValues: () => AI_KEY_PROVIDER_DEFAULTS.openai,
  }),
  openaiCompatible: makeWorkspaceIntegrationBinding({
    table: integrationOpenaiCompatibleModel,
    tableName: "IntegrationOpenaiCompatible",
    integrationType: "openaiCompatible",
    baseUrlColumn: integrationOpenaiCompatibleModel.baseURL,
    configColumns: [
      "baseURL",
      "defaultModel",
      "preset",
      "name",
      "autoReply",
      "enabled",
    ],
    defaultConfigValues: (input) => ({
      ...OPENAI_COMPATIBLE_DEFAULTS,
      name: input.descriptor.displayName,
    }),
  }),
  openrouter: makeWorkspaceIntegrationBinding({
    table: integrationOpenrouterModel,
    tableName: "IntegrationOpenrouter",
    integrationType: "openrouter",
    duplicateConstraint: "IntegrationOpenrouter_workspaceId_key",
    configColumns: AI_KEY_PROVIDER_CONFIG_COLUMNS,
    defaultConfigValues: () => AI_KEY_PROVIDER_DEFAULTS.openrouter,
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
