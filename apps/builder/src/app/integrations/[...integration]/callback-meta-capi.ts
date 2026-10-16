import {
  type ConnectCapiWithTokenInput,
  instagramIntegrationService,
  messengerIntegrationService,
  metaConversionsService,
} from "@chatbotx.io/business"
import { auditService } from "@chatbotx.io/business/audit"
import {
  exchangeCodeForToken as exchangeInstagramFacebookCode,
  getUserInstagramAccounts,
} from "@chatbotx.io/integration-instagram-facebook"
import {
  exchangeCodeForToken as exchangeMessengerCode,
  getUserPages,
} from "@chatbotx.io/integration-messenger"
import { exchangeLongLivedToken } from "@chatbotx.io/integration-messenger/apis/page"
import { getDataset } from "@chatbotx.io/integration-meta-conversions"
import type {
  CapiConnectErrorReason,
  CapiConnectResult,
  CapiOAuthChannel,
} from "@/features/meta-conversions/lib/capi-connect-result"
import { capiDatasetProvisioner } from "@/features/meta-conversions/lib/provision-capi-dataset"
import { assertWorkspaceSuperAdmin } from "@/lib/auth/assert-workspace-super-admin"
import { logger } from "@/lib/log"
import { consumeOAuthNonce } from "@/lib/oauth-state-nonce"

type ProviderCredentialConfig = {
  clientId: string
  clientSecret: string
  version: string
}

type CapiConnector = (input: {
  workspaceId: string
  integrationId: string
  credentialConfig: ProviderCredentialConfig
  callbackUrl: string
  code: string
}) => Promise<CapiConnectResult>

const SUCCESS: CapiConnectResult = { status: "success" }

const errorResult = (reason: CapiConnectErrorReason): CapiConnectResult => ({
  status: "error",
  reason,
})

/**
 * Creates the dataset with the freshly minted token and stores both together —
 * or stores nothing. Failing here is a Meta-side refusal (usually a permission
 * the admin withheld in the dialog), so it is reported as its own outcome.
 */
async function storeDedicatedCapiToken<TChannel extends CapiOAuthChannel>(
  input: Omit<ConnectCapiWithTokenInput<TChannel>, "validate">,
): Promise<CapiConnectResult> {
  try {
    const connected = await metaConversionsService.connectCapiWithToken({
      ...input,
      validate: getDataset,
    })
    // The write matched no row: the integration was removed after the lookup.
    return connected ? SUCCESS : errorResult("notFound")
  } catch (err) {
    logger.warn(
      { err, channel: input.channel, integrationId: input.integration.id },
      "Meta CAPI dataset could not be created with the dedicated token",
    )
    return errorResult("datasetFailed")
  }
}

const connectMessengerCapi: CapiConnector = async (input) => {
  const integration = await messengerIntegrationService.findByIdForWorkspace({
    id: input.integrationId,
    workspaceId: input.workspaceId,
  })
  if (!integration) {
    return errorResult("notFound")
  }

  const shortLivedUserToken = await exchangeMessengerCode(
    input.credentialConfig,
    input.code,
    input.callbackUrl,
  )
  const userToken = await exchangeLongLivedToken(
    input.credentialConfig,
    shortLivedUserToken,
  ).catch((err: unknown) => {
    logger.warn(
      { err },
      "Messenger long-lived token exchange failed during CAPI connect, using short-lived token",
    )
    return shortLivedUserToken
  })

  // The page is matched by the stored `pageId`, never by anything from OAuth state.
  const { pages } = await getUserPages(
    userToken,
    input.credentialConfig.version,
  )
  const page = pages.find(
    (userPage) => userPage.id === integration.pageId && userPage.access_token,
  )
  if (!page?.access_token) {
    return errorResult("pageNotFound")
  }

  return storeDedicatedCapiToken({
    channel: "messenger",
    integration,
    accessToken: await exchangeLongLivedToken(
      input.credentialConfig,
      page.access_token,
    ),
    provisionDataset: capiDatasetProvisioner("messenger"),
  })
}

const connectInstagramCapi: CapiConnector = async (input) => {
  const integration = await instagramIntegrationService.findByIdForWorkspace({
    id: input.integrationId,
    workspaceId: input.workspaceId,
  })
  // Instagram Business Login accounts have no Conversions API.
  if (integration?.type !== "facebook") {
    return errorResult("notFound")
  }

  const userToken = await exchangeInstagramFacebookCode(
    input.credentialConfig,
    input.code,
    input.callbackUrl,
  )
  const accounts = await getUserInstagramAccounts(
    userToken,
    input.credentialConfig.version,
  )
  // The account is matched by the stored `igId`, never by anything from OAuth state.
  const account = accounts.find(
    (candidate) => candidate.id === integration.igId,
  )
  if (!account) {
    return errorResult("accountNotFound")
  }

  return storeDedicatedCapiToken({
    channel: "instagram",
    integration,
    accessToken: account.pageAccessToken,
    provisionDataset: capiDatasetProvisioner("instagram"),
  })
}

const capiConnectors = {
  messenger: connectMessengerCapi,
  instagram: connectInstagramCapi,
} satisfies Record<CapiOAuthChannel, CapiConnector>

/**
 * Finishes the dedicated Conversions API connect for the OAuth callback.
 *
 * The callback is an API boundary and `state` is attacker-forgeable (base64 JSON
 * round-tripped through Facebook), so before any provider call this proves, in
 * order: the state names this callback's channel and an integration; the browser
 * holds the single-use nonce issued when Connect was pressed; the caller is a
 * super admin of the workspace; and the integration really is in that workspace.
 * Returns `"notFound"` for a malformed state or a non-admin — the caller turns it
 * into a 404 — and a `CapiConnectResult` otherwise: a nonce that is missing or
 * differs is `sessionExpired`, so the admin lands back on the Ads tab.
 */
export async function completeMetaCapiConnect(input: {
  channel: CapiOAuthChannel
  state: { capiChannel?: string; capiIntegrationId?: string; nonce?: string }
  workspaceId: string
  userId: string
  credentialConfig: ProviderCredentialConfig
  callbackUrl: string
  code: string
  request: { ipAddress: string; userAgent: string | undefined }
}): Promise<CapiConnectResult | "notFound"> {
  const { channel, state, workspaceId, userId } = input
  const integrationId = state.capiIntegrationId

  if (state.capiChannel !== channel || !integrationId || !state.nonce) {
    logger.debug({ workspaceId, channel }, "metaCapi OAuth state is incomplete")
    return "notFound"
  }
  // The caller already passed the session and workspace-membership checks, so a
  // missing nonce is almost always a legitimate admin whose cookie expired or was
  // replaced by a second Connect in another tab — answer with a result (a redirect
  // that also carries the cookie deletion), not a bare 404.
  if (!(await consumeOAuthNonce(state.nonce))) {
    logger.info(
      { workspaceId, userId, channel },
      "metaCapi OAuth callback without the matching nonce cookie",
    )
    return errorResult("sessionExpired")
  }
  try {
    await assertWorkspaceSuperAdmin(workspaceId)
  } catch {
    logger.info(
      { workspaceId, userId, channel },
      "metaCapi OAuth callback: non-super-admin blocked",
    )
    return "notFound"
  }

  let result: CapiConnectResult
  try {
    result = await capiConnectors[channel]({
      workspaceId,
      integrationId,
      credentialConfig: input.credentialConfig,
      callbackUrl: input.callbackUrl,
      code: input.code,
    })
  } catch (err) {
    logger.error(
      { err, workspaceId, channel, integrationId },
      "Meta CAPI connect failed unexpectedly",
    )
    return errorResult("failed")
  }

  if (result.status === "success") {
    await auditService.record({
      userId,
      workspaceId,
      action: "update",
      detail: `connected the Conversions API for the ${channel} channel`,
      ipAddress: input.request.ipAddress,
      userAgent: input.request.userAgent,
    })
  }
  return result
}
