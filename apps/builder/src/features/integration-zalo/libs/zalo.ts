import type { ZaloCredentialPublic } from "@chatbotx.io/database/partials"
import { generateAuthUrl } from "@chatbotx.io/integration-zalo"
import { getOriginFromHeader } from "@/lib/domain"
import { buildProviderCallbackUrl } from "@/lib/provider-origin"

export async function generateZaloRedirectUri(
  credential: {
    userId: string | null
    publicConfig: ZaloCredentialPublic
  },
  workspaceId?: string | null,
) {
  const baseUrl = await getOriginFromHeader()

  // The OAuth redirect_uri must be registered in the Zalo app. For a
  // tenant-owned credential (their own app), that's the reseller's custom
  // domain; otherwise it's the broker, and the originating branded domain is
  // recovered from `referer` (the callback relays back to it), matching the
  // other integrations.
  const redirectUrl = await buildProviderCallbackUrl(
    credential,
    "/integrations/zalo/callback",
  )
  const referer = workspaceId
    ? new URL(`/space/${workspaceId}`, baseUrl).toString()
    : baseUrl

  return generateAuthUrl({
    clientId: credential.publicConfig.clientId,
    clientSecret: "",
    redirectUrl,
    stateParams: {
      workspaceId,
      referer,
    },
  })
}
