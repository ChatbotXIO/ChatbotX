import type { TiktokCredentialPublic } from "@chatbotx.io/database/partials"
import { generateAuthUrl } from "@chatbotx.io/integration-tiktok"
import { env } from "@/env"
import { getOriginUrlFromHeader } from "@/lib/domain"

export async function generateTiktokRedirectUri(
  publicConfig: TiktokCredentialPublic,
  workspaceId?: string | null,
) {
  // The OAuth redirect_uri must be registered in the (platform) TikTok app.
  // A white-label custom domain is not registered there, so we always send
  // TikTok to the fixed platform callback and recover the originating branded
  // domain from `referer` (the callback relays back to it).
  const redirectUrl = new URL(
    "/integrations/tiktok/callback",
    env.NEXT_PUBLIC_BUILDER_URL,
  ).toString()
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
