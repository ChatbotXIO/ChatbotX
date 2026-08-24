import type { TiktokCredentialPublic } from "@chatbotx.io/database/partials"
import { generateAuthUrl } from "@chatbotx.io/integration-tiktok"
import { getOriginFromHeader } from "@/lib/domain"
import { buildProviderCallbackUrl } from "@/lib/provider-origin"

export async function generateTiktokRedirectUri(
  credential: {
    userId: string | null
    publicConfig: TiktokCredentialPublic
  },
  workspaceId?: string | null,
) {
  // The OAuth redirect_uri must be registered in the TikTok app. For a
  // tenant-owned credential (their own app), that's the reseller's custom
  // domain; otherwise it's the broker, and the originating branded domain is
  // recovered from `referer` (the callback relays back to it).
  const redirectUrl = await buildProviderCallbackUrl(
    credential,
    "/integrations/tiktok/callback",
  )
  const baseUrl = await getOriginFromHeader()
  const referer = workspaceId
    ? new URL(`/space/${workspaceId}`, baseUrl).toString()
    : baseUrl

  return generateAuthUrl({
    clientId: credential.publicConfig.clientId,
    redirectUrl,
    stateParams: {
      workspaceId,
      referer,
    },
  })
}
