import {
  apiConnectConfigSchema,
  integrationApiService,
  integrationWebchatService,
  webchatConnectConfigSchema,
} from "@chatbotx.io/business"
import {
  CONNECTION_STORE_BINDINGS,
  type ConnectionAdapter,
  type ConnectionRegistry,
  claudeConnectionProvider,
  deepseekConnectionProvider,
  geminiConnectionProvider,
  openaiCompatibleConnectionProvider,
  openaiConnectionProvider,
  openrouterConnectionProvider,
} from "@chatbotx.io/business/connection"
import { integration as integrationActiveCampaign } from "@chatbotx.io/integration-active-campaign"
import { integration as integrationApi } from "@chatbotx.io/integration-api"
import { integration as integrationChatbotx } from "@chatbotx.io/integration-chatbotx"
import { integration as integrationDrip } from "@chatbotx.io/integration-drip"
import { integration as integrationFacebookAds } from "@chatbotx.io/integration-facebook-ads"
import { integration as integrationGetResponse } from "@chatbotx.io/integration-get-response"
import { integration as integrationGoogleCalendar } from "@chatbotx.io/integration-google-calendar"
import { integration as integrationGoogleSheets } from "@chatbotx.io/integration-google-sheets"
import { integration as integrationInstagram } from "@chatbotx.io/integration-instagram"
import { integration as integrationInstagramFacebook } from "@chatbotx.io/integration-instagram-facebook"
import { integration as integrationKlaviyo } from "@chatbotx.io/integration-klaviyo"
import { integration as integrationMailchimp } from "@chatbotx.io/integration-mailchimp"
import { integration as integrationMailerLite } from "@chatbotx.io/integration-mailer-lite"
import { integration as integrationMessenger } from "@chatbotx.io/integration-messenger"
import { integration as integrationMoosend } from "@chatbotx.io/integration-moosend"
import { integration as integrationSendGrid } from "@chatbotx.io/integration-sendgrid"
import { integration as integrationSmtp } from "@chatbotx.io/integration-smtp"
import { integration as integrationTelegram } from "@chatbotx.io/integration-telegram"
import { integration as integrationThreads } from "@chatbotx.io/integration-threads"
import { integration as integrationTiktok } from "@chatbotx.io/integration-tiktok"
import { integration as integrationWebchat } from "@chatbotx.io/integration-webchat"
import { integration as integrationWhatsapp } from "@chatbotx.io/integration-whatsapp"
import { integration as integrationZalo } from "@chatbotx.io/integration-zalo"
import type { Integration, IntegrationDefinition } from "@chatbotx.io/sdk"
import { messengerConnectionTeardownHook } from "./messenger-teardown"

type StoreBindingKey = keyof typeof CONNECTION_STORE_BINDINGS

type StoreBoundAdapter<Key extends StoreBindingKey> = ConnectionAdapter & {
  readonly storeKey: Key
}

type StoreBoundConnectionRegistry = {
  [Key in keyof ConnectionRegistry]: Key extends StoreBindingKey
    ? StoreBoundAdapter<Key> | null
    : ConnectionAdapter | null
}

/**
 * Builds a `ConnectionAdapter` from an `integrations/<name>` SDK package's
 * `Integration` instance. Throws at module-load time (not per-request) if
 * the provider's `connection` block is missing — every `IntegrationType`
 * wired into this registry is asserted, at registration time, to have one;
 * a provider that regresses to having none fails the build immediately
 * instead of silently returning `undefined` behind an optional chain.
 */
const fromIntegration = <Key extends StoreBindingKey>(
  // biome-ignore lint/suspicious/noExplicitAny: heterogeneous registry
  integration: Integration<IntegrationDefinition<any, any, any>>,
  storeKey: Key,
  credentialType?: ConnectionAdapter["credentialType"],
): StoreBoundAdapter<Key> => {
  if (integration.name !== storeKey) {
    throw new Error(
      `@chatbotx.io/connections: integration "${integration.name}" cannot use store binding "${storeKey}"`,
    )
  }
  const provider = integration.connection
  if (!provider) {
    throw new Error(
      `@chatbotx.io/connections: "${integration.name}" has no connection block registered under CONNECTION_REGISTRY.${storeKey}`,
    )
  }
  const store = CONNECTION_STORE_BINDINGS[storeKey] ?? undefined
  return { integration, provider, store, credentialType, storeKey }
}

/**
 * A credential-only provider (no `integrations/` package) paired with its
 * store binding — the same shape `fromIntegration` produces, minus the SDK
 * `Integration` wrapper these providers never had.
 */
const fromCredentialProvider = <Key extends StoreBindingKey>(
  provider: ConnectionAdapter["provider"],
  storeKey: Key,
): StoreBoundAdapter<Key> => {
  const store = CONNECTION_STORE_BINDINGS[storeKey]
  if (!store) {
    throw new Error(
      `@chatbotx.io/connections: no store binding for "${storeKey}"`,
    )
  }
  return { provider, store, storeKey }
}

const connectWebchat: NonNullable<ConnectionAdapter["connect"]> = async (
  input,
) => {
  const data = webchatConnectConfigSchema.parse(input.config)
  const actorUserId = input.actor.actorUserId
  const result = await integrationWebchatService.createWithWorkspace({
    workspaceId: input.workspaceId,
    createdBy: actorUserId ?? input.ownerId,
    ...(actorUserId ? { actorUserId } : {}),
    workspaceName: data.name,
    data: {
      ...data,
      auth: {},
      customCss: data.customCss ?? null,
    },
  })
  return { connection: result.connection }
}

const connectApi: NonNullable<ConnectionAdapter["connect"]> = async (input) => {
  const { callbackUrl, name } = apiConnectConfigSchema.parse(input.config)
  const actorUserId = input.actor.actorUserId
  const result = await integrationApiService.createWithToken({
    ownerId: input.ownerId,
    ...(actorUserId ? { actorUserId } : {}),
    workspaceId: input.workspaceId,
    name,
    callbackUrl,
  })
  return {
    connection: result.connection,
    secret: { kind: "api_channel_token", token: result.token },
  }
}

/**
 * Compile-time exhaustive `Record<IntegrationType, ConnectionAdapter | null>`.
 * `null` marks a type with no connect lifecycle yet: `metaCatalog` and
 * `outlookCalendar` have no live builder feature or supported connection
 * engine path. `chatbotx` DOES have a real adapter (its `store` is
 * `undefined` — it has no satellite table; the `Inbox` row is the whole
 * connection).
 */
export const CONNECTION_REGISTRY: StoreBoundConnectionRegistry = {
  activeCampaign: fromIntegration(integrationActiveCampaign, "activeCampaign"),
  api: {
    ...fromIntegration(integrationApi, "api"),
    connect: connectApi,
  },
  chatbotx: fromIntegration(integrationChatbotx, "chatbotx"),
  claude: fromCredentialProvider(claudeConnectionProvider, "claude"),
  deepseek: fromCredentialProvider(deepseekConnectionProvider, "deepseek"),
  drip: fromIntegration(integrationDrip, "drip"),
  facebookAds: fromIntegration(
    integrationFacebookAds,
    "facebookAds",
    "messenger",
  ),
  gemini: fromCredentialProvider(geminiConnectionProvider, "gemini"),
  getResponse: fromIntegration(integrationGetResponse, "getResponse"),
  googleCalendar: fromIntegration(
    integrationGoogleCalendar,
    "googleCalendar",
    "google",
  ),
  googleSheets: fromIntegration(
    integrationGoogleSheets,
    "googleSheets",
    "google",
  ),
  instagram: fromIntegration(integrationInstagram, "instagram", "instagram"),
  instagramFacebook: fromIntegration(
    integrationInstagramFacebook,
    "instagramFacebook",
    "instagramFacebook",
  ),
  klaviyo: fromIntegration(integrationKlaviyo, "klaviyo"),
  mailchimp: fromIntegration(integrationMailchimp, "mailchimp"),
  mailerLite: fromIntegration(integrationMailerLite, "mailerLite"),
  messenger: {
    ...fromIntegration(integrationMessenger, "messenger", "messenger"),
    teardown: messengerConnectionTeardownHook,
  },
  metaCatalog: null,
  moosend: fromIntegration(integrationMoosend, "moosend"),
  openai: fromCredentialProvider(openaiConnectionProvider, "openai"),
  openaiCompatible: fromCredentialProvider(
    openaiCompatibleConnectionProvider,
    "openaiCompatible",
  ),
  openrouter: fromCredentialProvider(
    openrouterConnectionProvider,
    "openrouter",
  ),
  outlookCalendar: null,
  sendGrid: fromIntegration(integrationSendGrid, "sendGrid"),
  smtp: fromIntegration(integrationSmtp, "smtp"),
  telegram: fromIntegration(integrationTelegram, "telegram"),
  threads: fromIntegration(integrationThreads, "threads", "threads"),
  tiktok: fromIntegration(integrationTiktok, "tiktok", "tiktok"),
  webchat: {
    ...fromIntegration(integrationWebchat, "webchat"),
    connect: connectWebchat,
  },
  whatsapp: fromIntegration(integrationWhatsapp, "whatsapp", "whatsapp"),
  zalo: fromIntegration(integrationZalo, "zalo", "zalo"),
}
