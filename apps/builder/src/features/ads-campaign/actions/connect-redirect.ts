import { platformCredentialService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import type { MessagingAdChannel } from "@chatbotx.io/database/partials"
import type { WorkspaceModel } from "@chatbotx.io/database/types"
import { generateAdsAuthUrl } from "@chatbotx.io/integration-facebook-ads"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { getOriginUrlFromHeader } from "@/lib/domain"
import { resolveOwnerForWorkspace } from "@/lib/platform-credential-owner"
import { buildProviderCallbackUrl } from "@/lib/provider-origin"
import { messagingAdsScopesForChannel } from "../lib/messaging-ads-scopes"

/**
 * Per-integration Connect button target for a messaging-ads box (CTWA/CTM/
 * CTID) — mirrors `buildFacebookAdsAuthRedirect`
 * (`features/integration-facebook-ads/actions/connect-redirect.ts`), reusing
 * the same Messenger app credential + Messenger OAuth callback, but with
 * `state.flow = "messagingAds"` carrying `channel` + `integrationId` so the
 * callback stores the token on `MessagingAdsConnection` (the per-integration
 * table) instead of the workspace-wide `IntegrationFacebookAds` row — see
 * out/plan/ctwa-ctm-ctid-box-merge.md "Auth = per-integration".
 */
export async function buildMessagingAdsConnectRedirect({
  workspace,
  channel,
  integrationId,
  refererPath,
}: {
  workspace: WorkspaceModel
  channel: MessagingAdChannel
  integrationId: string
  refererPath: string
}) {
  const messengerCredential = await platformCredentialService.resolveForOwner({
    ownerId: await resolveOwnerForWorkspace(workspace),
    type: "messenger",
  })
  if (!messengerCredential) {
    const t = await getTranslations()
    throw new ChatbotXException(t("facebookAds.errors.invalidAppSettings"))
  }

  // Only the Messenger callback is registered as a redirect_uri with the
  // Facebook app — reused here exactly like the workspace-wide Facebook Ads
  // connect flow.
  const redirectUrl = await buildProviderCallbackUrl(
    messengerCredential,
    "/integrations/messenger/callback",
  )
  const baseUrl = await getOriginUrlFromHeader()
  const referer = new URL(refererPath, baseUrl).toString()

  const authUrl = generateAdsAuthUrl({
    clientId: messengerCredential.config.clientId,
    version: messengerCredential.config.version,
    redirectUrl,
    scopes: messagingAdsScopesForChannel(channel),
    stateParams: {
      workspaceId: workspace.id,
      referer,
      flow: "messagingAds",
      messagingAdsChannel: channel,
      messagingAdsIntegrationId: integrationId,
    },
  })

  return redirect(authUrl)
}
