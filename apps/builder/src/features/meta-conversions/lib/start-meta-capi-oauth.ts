import {
  instagramIntegrationService,
  messengerIntegrationService,
  platformCredentialService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import type { WorkspaceModel } from "@chatbotx.io/database/types"
import { generateCapiAuthUrl as generateInstagramCapiAuthUrl } from "@chatbotx.io/integration-instagram-facebook"
import { generateCapiAuthUrl as generateMessengerCapiAuthUrl } from "@chatbotx.io/integration-messenger"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { assertWorkspaceSuperAdmin } from "@/lib/auth/assert-workspace-super-admin"
import { getOriginUrlFromHeader } from "@/lib/domain"
import { issueOAuthNonce } from "@/lib/oauth-state-nonce"
import { resolveOwnerForWorkspace } from "@/lib/platform-credential-owner"
import { buildProviderCallbackUrl } from "@/lib/provider-origin"
import type { CapiOAuthChannel } from "./capi-connect-result"

type IntegrationRef = { id: string; workspaceId: string }

/** What the Facebook dialog needs to know about one channel; the flow itself is channel-agnostic. */
type CapiOAuthStrategy = {
  credentialType: "messenger" | "instagramFacebook"
  callbackPath: string
  adsTabPath: (workspaceId: string, integrationId: string) => string
  /** `null` when the integration is not in the workspace; `supported: false` when it has no Conversions API. */
  findIntegration: (
    ref: IntegrationRef,
  ) => Promise<{ supported: boolean } | null>
  notFoundMessage: "messengerNotFound" | "instagramNotFound"
  generateAuthUrl: typeof generateMessengerCapiAuthUrl
}

const capiOAuthStrategies = {
  messenger: {
    credentialType: "messenger",
    callbackPath: "/integrations/messenger/callback",
    adsTabPath: (workspaceId, integrationId) =>
      `/space/${workspaceId}/messengers/${integrationId}/ads`,
    findIntegration: async (ref) =>
      (await messengerIntegrationService.findByIdForWorkspace(ref))
        ? { supported: true }
        : null,
    notFoundMessage: "messengerNotFound",
    generateAuthUrl: generateMessengerCapiAuthUrl,
  },
  instagram: {
    credentialType: "instagramFacebook",
    callbackPath: "/integrations/instagram-facebook/callback",
    adsTabPath: (workspaceId, integrationId) =>
      `/space/${workspaceId}/instagrams/${integrationId}/ads`,
    findIntegration: async (ref) => {
      const integration =
        await instagramIntegrationService.findByIdForWorkspace(ref)
      // Instagram Business Login accounts have no Conversions API.
      return integration ? { supported: integration.type === "facebook" } : null
    },
    notFoundMessage: "instagramNotFound",
    generateAuthUrl: generateInstagramCapiAuthUrl,
  },
} satisfies Record<CapiOAuthChannel, CapiOAuthStrategy>

/**
 * Sends a workspace admin to the Facebook dialog that mints the dedicated
 * Conversions API token for one channel. The channel's own login is untouched:
 * the callback (`callback-meta-capi.ts`) stores the result separately.
 *
 * The OAuth `state` carries a single-use nonce that is also set as an httpOnly
 * cookie, so only the browser that pressed Connect can complete the round trip.
 */
export async function startMetaCapiOAuth(input: {
  channel: CapiOAuthChannel
  workspace: WorkspaceModel
  integrationId: string
}): Promise<never> {
  const { channel, workspace, integrationId } = input
  const strategy: CapiOAuthStrategy = capiOAuthStrategies[channel]
  const t = await getTranslations("metaConversions.errors")

  await assertWorkspaceSuperAdmin(workspace.id)

  const integration = await strategy.findIntegration({
    id: integrationId,
    workspaceId: workspace.id,
  })
  if (!integration) {
    throw new ChatbotXException(t(strategy.notFoundMessage))
  }
  if (!integration.supported) {
    throw new ChatbotXException(t("instagramRequiresFacebook"))
  }

  const credential = await platformCredentialService.resolveForOwner({
    ownerId: await resolveOwnerForWorkspace(workspace),
    type: strategy.credentialType,
  })
  if (!credential) {
    throw new ChatbotXException(t("appNotConfigured"))
  }

  const redirectUrl = await buildProviderCallbackUrl(
    credential,
    strategy.callbackPath,
  )
  const referer = new URL(
    strategy.adsTabPath(workspace.id, integrationId),
    await getOriginUrlFromHeader(),
  ).toString()

  return redirect(
    strategy.generateAuthUrl({
      clientId: credential.config.clientId,
      version: credential.config.version,
      redirectUrl,
      stateParams: {
        workspaceId: workspace.id,
        referer,
        flow: "metaCapi",
        capiChannel: channel,
        capiIntegrationId: integrationId,
        nonce: await issueOAuthNonce(),
      },
    }),
  )
}
