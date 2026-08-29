import {
  type CapiScopeCheckInput,
  instagramIntegrationService,
  integrationWhatsappService,
  type MetaConversionsChannel,
  type MetaConversionsIntegrationByChannel,
  messengerIntegrationService,
  metaConversionsService,
  platformCredentialService,
  WHATSAPP_CAPI_SCOPE,
  workspaceService,
} from "@chatbotx.io/business"
import {
  debugToken as debugInstagramFacebookToken,
  hasInstagramManageEventsScope,
  toAppAccessToken as toInstagramFacebookAppAccessToken,
} from "@chatbotx.io/integration-instagram-facebook"
import {
  debugToken as debugMessengerToken,
  hasPageEventsScope,
  toAppAccessToken as toMessengerAppAccessToken,
} from "@chatbotx.io/integration-messenger"
import { debugTokenOrThrow } from "@chatbotx.io/integration-whatsapp/api/auth"

/**
 * Shared CAPI dataset resource type + integration resolvers + scope
 * checkers, extracted out of `send-meta-capi-event.ts` (Phase 3) so
 * `send-conversion-event.ts`'s messenger/instagram CAPI branch can reuse
 * them instead of duplicating them.
 *
 * NOTE (deviation from the plan text): the plan called for moving these into
 * `packages/business/src/meta-conversions/`, but `integrations/messenger`
 * and `integrations/instagram-facebook` both depend on `@chatbotx.io/business`
 * — moving code that imports those integration packages INTO business would
 * create a circular dependency. Both worker handlers already live in
 * `apps/worker`, so a shared module at this layer gets the same "don't
 * duplicate" outcome without the cycle.
 */

const datasetResourceTypeByChannel = {
  messenger: "page",
  instagram: "igUser",
  whatsapp: "waba",
} as const satisfies Record<MetaConversionsChannel, "page" | "igUser" | "waba">

const integrationResolvers = {
  messenger: (input) => messengerIntegrationService.findByIdForWorkspace(input),
  instagram: (input) => instagramIntegrationService.findByIdForWorkspace(input),
  whatsapp: (input) => integrationWhatsappService.findByIdForWorkspace(input),
} satisfies {
  [TChannel in MetaConversionsChannel]: (input: {
    id: string
    workspaceId: string
  }) => Promise<
    MetaConversionsIntegrationByChannel[TChannel] | null | undefined
  >
}

export async function findEventIntegration<
  TChannel extends MetaConversionsChannel,
>(
  channel: TChannel,
  input: {
    integrationId: string
    workspaceId: string
  },
): Promise<MetaConversionsIntegrationByChannel[TChannel] | null> {
  const resolveIntegration = integrationResolvers[channel] as (input: {
    id: string
    workspaceId: string
  }) => Promise<
    MetaConversionsIntegrationByChannel[TChannel] | null | undefined
  >

  return (
    (await resolveIntegration({
      id: input.integrationId,
      workspaceId: input.workspaceId,
    })) ?? null
  )
}

export function datasetResourceType(
  channel: MetaConversionsChannel,
): "page" | "igUser" | "waba" {
  return datasetResourceTypeByChannel[channel]
}

type MetaCapiScopeCheckerConfig = {
  credentialType: Extract<
    Parameters<typeof platformCredentialService.resolveForOwner>[0]["type"],
    "messenger" | "instagramFacebook"
  >
  debugToken: (input: {
    inputToken: string
    appAccessToken: string
    version?: string
  }) => Promise<{ scopes?: string[] }>
  toAppAccessToken: (credentials: {
    clientId: string
    clientSecret: string
  }) => string
  hasScope: (scopes: string[] | undefined) => boolean
}

/**
 * Shared implementation for `checkMessengerCapiScope`/`checkInstagramCapiScope`
 * — structurally identical beyond which platform credential/debug-token/
 * scope-check functions to use, driven by the per-channel config below.
 * `checkWhatsappCapiScope` stays a separate function: it debugs the token
 * differently (`debugTokenOrThrow` + `granular_scopes`/`target_ids`, not a
 * `scopes` array + boolean scope-name check).
 */
async function checkMetaCapiScope(
  input: CapiScopeCheckInput,
  storedHasCapiScope: boolean,
  workspaceId: string,
  config: MetaCapiScopeCheckerConfig,
): Promise<boolean> {
  const workspace = await workspaceService.findById({ id: workspaceId })
  const credential = await platformCredentialService.resolveForOwner({
    ownerId: workspace.ownerId,
    type: config.credentialType,
  })
  if (!credential) {
    return storedHasCapiScope
  }

  const debug = await config.debugToken({
    inputToken: input.accessToken,
    appAccessToken: config.toAppAccessToken(credential.config),
    version: credential.config.version,
  })

  return config.hasScope(debug.scopes)
}

const checkMessengerCapiScope = (
  input: CapiScopeCheckInput,
  storedHasCapiScope: boolean,
  workspaceId: string,
): Promise<boolean> =>
  checkMetaCapiScope(input, storedHasCapiScope, workspaceId, {
    credentialType: "messenger",
    debugToken: debugMessengerToken,
    toAppAccessToken: toMessengerAppAccessToken,
    hasScope: hasPageEventsScope,
  })

const checkInstagramCapiScope = (
  input: CapiScopeCheckInput,
  storedHasCapiScope: boolean,
  workspaceId: string,
): Promise<boolean> =>
  checkMetaCapiScope(input, storedHasCapiScope, workspaceId, {
    credentialType: "instagramFacebook",
    debugToken: debugInstagramFacebookToken,
    toAppAccessToken: toInstagramFacebookAppAccessToken,
    hasScope: hasInstagramManageEventsScope,
  })

/**
 * Worker-local WhatsApp CAPI scope check — mirrors the builder's
 * `hasWhatsappCapiScope` (apps/builder/src/features/integration-whatsapp/libs/capi-scope.ts)
 * without importing across the `@/...` app boundary. The app access token
 * comes from the workspace owner's WhatsApp platform credential
 * (`clientId|clientSecret`), same as the messenger/instagram checkers above.
 */
async function checkWhatsappCapiScope(
  input: CapiScopeCheckInput,
  storedHasCapiScope: boolean,
  workspaceId: string,
): Promise<boolean> {
  const workspace = await workspaceService.findById({ id: workspaceId })
  const credential = await platformCredentialService.resolveForOwner({
    ownerId: workspace.ownerId,
    type: "whatsapp",
  })
  if (!credential) {
    return storedHasCapiScope
  }

  const appAccessToken = `${credential.config.clientId}|${credential.config.clientSecret}`
  const token = await debugTokenOrThrow(input.accessToken, appAccessToken)
  const capiScope = token?.granular_scopes?.find(
    (scope) => scope.scope === WHATSAPP_CAPI_SCOPE,
  )
  if (!capiScope) {
    return false
  }

  return (
    !capiScope.target_ids ||
    capiScope.target_ids.length === 0 ||
    capiScope.target_ids.includes(input.resourceId)
  )
}

const scopeCheckers = {
  messenger: checkMessengerCapiScope,
  instagram: checkInstagramCapiScope,
  whatsapp: checkWhatsappCapiScope,
} satisfies {
  [TChannel in MetaConversionsChannel]: (
    input: CapiScopeCheckInput,
    storedHasCapiScope: boolean,
    workspaceId: string,
  ) => Promise<boolean>
}

export async function refreshScopeCache<
  TChannel extends MetaConversionsChannel,
>(
  channel: TChannel,
  integration: MetaConversionsIntegrationByChannel[TChannel],
): Promise<MetaConversionsIntegrationByChannel[TChannel]> {
  const refreshed = await metaConversionsService.refreshCapiScopeCache({
    channel,
    integration,
    checkScope: (input) =>
      scopeCheckers[channel](
        input,
        integration.hasCapiScope,
        integration.workspaceId,
      ),
  })

  return refreshed ?? integration
}
