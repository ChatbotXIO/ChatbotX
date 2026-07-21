import type { InstagramCredentialPublic } from "@chatbotx.io/database/partials"
import { generateAuthUrl } from "@chatbotx.io/integration-instagram-facebook"
import { getOriginFromHeader } from "@/lib/domain"
import { buildBrokerCallbackUrl } from "@/lib/oauth-broker"

export async function generateInstagramFacebookRedirectUri(
  publicConfig: InstagramCredentialPublic,
  workspaceId?: string | null,
) {
  const redirectUrl = buildBrokerCallbackUrl(
    "/integrations/instagram-facebook/callback",
  )
  const baseUrl = await getOriginFromHeader()
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
