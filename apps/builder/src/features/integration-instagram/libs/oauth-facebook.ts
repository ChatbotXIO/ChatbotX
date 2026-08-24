import type { InstagramCredentialPublic } from "@chatbotx.io/database/partials"
import { generateAuthUrl } from "@chatbotx.io/integration-instagram-facebook"
import { getOriginFromHeader } from "@/lib/domain"
import { buildProviderCallbackUrl } from "@/lib/provider-origin"

export async function generateInstagramFacebookRedirectUri(
  credential: {
    userId: string | null
    publicConfig: InstagramCredentialPublic
  },
  workspaceId?: string | null,
) {
  // The OAuth redirect_uri must be registered in the Facebook app. For a
  // tenant-owned credential (their own app), that's the reseller's custom
  // domain; otherwise it's the broker, and the originating branded domain is
  // recovered from `referer` (the callback relays back to it).
  const redirectUrl = await buildProviderCallbackUrl(
    credential,
    "/integrations/instagram-facebook/callback",
  )
  const baseUrl = await getOriginFromHeader()
  const referer = workspaceId
    ? new URL(`/space/${workspaceId}/dashboard`, baseUrl).toString()
    : baseUrl

  return generateAuthUrl({
    clientId: credential.publicConfig.clientId,
    version: credential.publicConfig.version,
    redirectUrl,
    stateParams: {
      workspaceId,
      referer,
    },
  })
}
