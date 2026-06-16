import type { TiktokCredentialPublic } from "@chatbotx.io/database/partials"
import { generateAuthUrl } from "@chatbotx.io/integration-tiktok"
import { getOriginUrlFromHeader } from "@/lib/domain"
import { buildBrokerCallbackUrl } from "@/lib/oauth-broker"

export async function generateTiktokRedirectUri(
  publicConfig: TiktokCredentialPublic,
  workspaceId?: string | null,
) {
  // The OAuth redirect_uri must be registered in the TikTok app (platform or
  // reseller-owned). A white-label custom domain is not registered there, so we
  // always send TikTok to the fixed broker callback and recover the originating
  // branded domain from `referer` (the callback relays back to it).
  const redirectUrl = buildBrokerCallbackUrl("/integrations/tiktok/callback")
  const baseUrl = await getOriginUrlFromHeader()
  const referer = workspaceId
    ? new URL(`/space/${workspaceId}/dashboard`, baseUrl).toString()
    : baseUrl

  return generateAuthUrl({
    clientId: publicConfig.clientId,
    redirectUrl,
    stateParams: {
      workspaceId,
      referer,
    },
  })
}
