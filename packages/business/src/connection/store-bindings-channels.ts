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
  integrationMoosendModel,
  integrationOpenaiCompatibleModel,
  integrationOpenaiModel,
  integrationOpenrouterModel,
  integrationSendGridModel,
  integrationSmtpModel,
  integrationTelegramModel,
  integrationThreadsModel,
  integrationTiktokModel,
  integrationWebchatModel,
  integrationWhatsappModel,
  integrationZaloModel,
} from "@chatbotx.io/database/schema"
import type {
  ConnectionStoreBinding,
  makeChannelBinding,
  makeWorkspaceIntegrationBinding,
} from "./store-bindings"

// Type-only aliases of the two binding factories — `buildConnectionStoreBindings`
// below takes them as parameters rather than importing them as values:
// `store-bindings.ts` already imports this module (for that function), so a
// value import running the other way would make the two files circular.
type MakeChannelBinding = typeof makeChannelBinding
type MakeWorkspaceIntegrationBinding = typeof makeWorkspaceIntegrationBinding

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

/**
 * `jsonb().default(sql`[]`).notNull()` columns have no database default
 * (drizzle-kit drops it — pinned in `schema-default-parity.test.ts`), so an
 * insert that omits them is a NOT NULL violation.
 */
const messagingProfileDefaults = () => ({
  conversationStarters: [],
  persistentMenus: [],
})

/**
 * Per-channel/per-integration `ConnectionStoreBinding` entries assembled by
 * `store-bindings.ts` into its `CONNECTION_STORE_BINDINGS` map.
 */
export const buildConnectionStoreBindings = (
  makeChannelBinding: MakeChannelBinding,
  makeWorkspaceIntegrationBinding: MakeWorkspaceIntegrationBinding,
): Partial<Record<IntegrationType, ConnectionStoreBinding | null>> => ({
  activeCampaign: makeWorkspaceIntegrationBinding({
    table: integrationActiveCampaignModel,
    tableName: "IntegrationActiveCampaign",
    integrationType: "activeCampaign",
    duplicateConstraint: "IntegrationActiveCampaign_workspaceId_key",
  }),
  api: makeChannelBinding({
    table: integrationApiModel,
    tableName: "IntegrationApi",
    identityColumn: "id",
    onDisconnect: "keep_row",
    configColumns: ["tokenHash", "tokenPrefix", "callbackUrl"],
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
    extraInsertValues: { ...messagingProfileDefaults(), type: "instagram" },
    extraWhere: { type: "instagram" },
    // OAuth-only (no `fromCredentials`): `candidateToConfig` is
    // developer-derived from `auth`, never client input — see
    // `integrations/instagram/src/integration.ts`.
    configColumns: ["pageId", "username"],
  }),
  instagramFacebook: makeChannelBinding({
    table: integrationInstagramModel,
    tableName: "IntegrationInstagram",
    identityColumn: "igId",
    onDisconnect: "delete_row",
    duplicateConstraint: "IntegrationInstagram_igId_key",
    extraInsertValues: { ...messagingProfileDefaults(), type: "facebook" },
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
    extraInsertValues: { ...messagingProfileDefaults(), personas: [] },
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
    duplicateConstraint: "IntegrationOpenAI_workspaceId_key",
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
    // PARTIAL unique index (`where preset <> 'custom'`, see
    // `schema/integration-openai-compatible.ts`) — Postgres still reports
    // this exact index name as `error.cause.constraint` on a violation, so
    // `isUniqueViolationError`'s plain name match (used identically for
    // messenger/instagram's full unique indexes above) maps it to
    // `connectionAlreadyConnectedException` the same way. Without this, a
    // second non-custom-preset connect in the same workspace 500s with the
    // raw Postgres error instead of surfacing
    // `openaiCompatible.validation.presetAlreadyConnected` on the connect
    // action — see that action's `isConnectionAlreadyConnectedError` catch.
    duplicateConstraint: "IntegrationOpenaiCompatible_workspaceId_preset_key",
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
    identityColumn: "id",
    onDisconnect: "keep_row",
    configColumns: ["fromAddress"],
  }),
  telegram: makeChannelBinding({
    table: integrationTelegramModel,
    tableName: "IntegrationTelegram",
    identityColumn: "botId",
    onDisconnect: "keep_row",
    duplicateConstraint: "IntegrationTelegram_botId_key",
  }),
  threads: makeChannelBinding({
    table: integrationThreadsModel,
    tableName: "IntegrationThreads",
    identityColumn: "threadsUserId",
    onDisconnect: "delete_row",
    duplicateConstraint: "IntegrationThreads_threadsUserId_key",
    // `tokenRefreshError`/`name`: a reconnect's `extraConfig` clears a
    // stale refresh-cron error and refreshes the display name through this
    // same `saveAuthByForeignKey` UPDATE, mirroring the legacy (pre-engine)
    // satellite-only update — see `integrationThreadsService.reconnect`.
    configColumns: ["username", "tokenRefreshError", "name"],
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
    identityColumn: "id",
    onDisconnect: "keep_row",
    extraInsertValues: { ...messagingProfileDefaults(), authorizedDomains: [] },
    configColumns: [
      "enable",
      "authorizedDomains",
      "conversationStarters",
      "persistentMenus",
      "brandColor",
      "hideHeader",
      "showLogo",
      "hideMessageInput",
      "customCss",
      "welcomeFlowId",
    ],
  }),
  // `id` is in `configColumns` (allow-listed above `ConfigColumn`'s
  // exclusion list) ONLY so `connectPhoneNumber` can set it on a fresh
  // insert: the manual-onboarding webhook URL
  // (`/integrations/whatsapp/webhook/{id}`) is minted from a locally
  // generated id BEFORE this row exists, so the satellite's real PK must
  // equal it for that route to ever find the row again. Never populated
  // from wire input — WhatsApp has no `fromCredentials` handler, so it is
  // unreachable from the generic `connectFromCredentials` HTTP path (see
  // `packages/connections/src/credentials.ts`'s strategy guard). A revive
  // (`saveAuthByForeignKey`'s UPDATE) must never receive this key — see
  // `connect.ts`'s comment at its call site.
  whatsapp: makeChannelBinding({
    table: integrationWhatsappModel,
    tableName: "IntegrationWhatsapp",
    identityColumn: "phoneNumberId",
    onDisconnect: "keep_row",
    duplicateConstraint: "IntegrationWhatsapp_phoneNumberId_key",
    configColumns: [
      "id",
      "wabaId",
      "businessId",
      "displayPhoneNumber",
      "isCoexist",
      "platformType",
    ],
  }),
  // No `duplicateConstraint` here, unlike every other channel's identity
  // column (messenger/instagram/whatsapp/telegram/tiktok): `IntegrationZalo`
  // has only a plain (non-unique) btree index on `oaId`
  // (`IntegrationZalo_oaId_idx`, see `schema/integration-zalo.ts`) — no
  // unique constraint actually exists for a duplicate insert to violate, so
  // mapping a made-up constraint name here would silently never fire. A
  // race connecting the same Zalo OA ID twice is NOT currently mapped to
  // `alreadyConnected` — `backfill-connections.ts`'s `duplicate_source_inbox`
  // report already surfaces OA IDs connected from multiple workspaces for
  // this exact reason. Fixing this for real requires a migration adding
  // `unique(oaId)` (or `unique(workspaceId, oaId)` if cross-workspace reuse
  // of the same OA is intentionally allowed) — out of scope here since this
  // change must not add/run a migration.
  zalo: makeChannelBinding({
    table: integrationZaloModel,
    tableName: "IntegrationZalo",
    identityColumn: "oaId",
    onDisconnect: "keep_row",
  }),
})
