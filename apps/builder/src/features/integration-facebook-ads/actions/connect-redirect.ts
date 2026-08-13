import { platformCredentialService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import type { WorkspaceModel } from "@chatbotx.io/database/types"
import { generateAdsAuthUrl } from "@chatbotx.io/integration-facebook-ads"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { getOriginUrlFromHeader } from "@/lib/domain"
import { buildBrokerCallbackUrl } from "@/lib/oauth-broker"
import { resolveOwnerForWorkspace } from "@/lib/platform-credential-owner"

export async function buildFacebookAdsAuthRedirect({
  workspace,
  refererPath,
}: {
  workspace: WorkspaceModel
  refererPath: string
}) {
  // Facebook Ads reuses the Messenger Facebook app credential; the OAuth
  // dialog only differs in the requested scopes (ads_read, ads_management).
  const messengerCredential = await platformCredentialService.resolveForOwner({
    ownerId: await resolveOwnerForWorkspace(workspace),
    type: "messenger",
  })
  if (!messengerCredential) {
    const t = await getTranslations()
    throw new ChatbotXException(t("facebookAds.errors.invalidAppSettings"))
  }

  // Only the Messenger callback is registered as a redirect_uri with the
  // Facebook app, so Facebook Ads OAuth lands there too. `flow` flags the
  // Ads token-storage dispatch in the callback handler; `referer` is the
  // page the user returns to on completion or cancel. Mirrors
  // `generateMessengerRedirectUri` in integration-messenger/libs/oauth.ts.
  const redirectUrl = buildBrokerCallbackUrl("/integrations/messenger/callback")
  const baseUrl = await getOriginUrlFromHeader()
  const referer = new URL(refererPath, baseUrl).toString()

  const authUrl = generateAdsAuthUrl({
    clientId: messengerCredential.config.clientId,
    version: messengerCredential.config.version,
    redirectUrl,
    stateParams: {
      workspaceId: workspace.id,
      referer,
      flow: "facebookAds",
    },
  })

  return redirect(authUrl)
}
