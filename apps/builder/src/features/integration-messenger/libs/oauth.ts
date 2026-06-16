import type { MessengerCredentialPublic } from "@chatbotx.io/database/partials"
import { generateAuthUrl } from "@chatbotx.io/integration-messenger"
import { getOriginUrlFromHeader } from "@/lib/domain"
import { buildBrokerCallbackUrl } from "@/lib/oauth-broker"

export async function generateMessengerRedirectUri(
  publicConfig: MessengerCredentialPublic,
  workspaceId?: string | null,
) {
  // The OAuth redirect_uri must be registered in the Facebook app (platform or
  // reseller-owned). A white-label custom domain is not registered there, so we
  // always send Facebook to the fixed broker callback and recover the originating
  // branded domain from `referer` (the callback relays back to it).
  const redirectUrl = buildBrokerCallbackUrl("/integrations/messenger/callback")
  const baseUrl = await getOriginUrlFromHeader()
  const referer = workspaceId
    ? new URL(`/space/${workspaceId}/dashboard`, baseUrl).toString()
    : baseUrl

  return generateAuthUrl({
    clientId: publicConfig.clientId,
    version: publicConfig.version,
    redirectUrl,
    stateParams: {
      workspaceId,
      referer,
    },
  })
}
