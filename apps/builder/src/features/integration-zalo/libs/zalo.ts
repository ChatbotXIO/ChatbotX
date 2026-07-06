import type { ZaloCredentialPublic } from "@chatbotx.io/database/partials"
import { generateAuthUrl } from "@chatbotx.io/integration-zalo"
import { getOriginUrlFromHeader } from "@/lib/domain"
import { buildBrokerCallbackUrl } from "@/lib/oauth-broker"

export async function generateZaloRedirectUri(
  publicConfig: ZaloCredentialPublic,
  workspaceId?: string | null,
) {
  const baseUrl = await getOriginUrlFromHeader()

  // The OAuth redirect_uri must be registered in the Zalo app. A white-label
  // custom domain (the live request host) is not registered there, so send Zalo
  // to the fixed broker callback and recover the originating branded domain from
  // `referer` (the callback relays back to it), matching the other integrations.
  const redirectUrl = buildBrokerCallbackUrl("/integrations/zalo/callback")
  const referer = workspaceId
    ? new URL(`/space/${workspaceId}`, baseUrl).toString()
    : baseUrl

  return generateAuthUrl({
    clientId: publicConfig.clientId,
    clientSecret: "",
    redirectUrl,
    stateParams: {
      workspaceId,
      referer,
    },
  })
}
