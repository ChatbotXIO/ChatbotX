import type { MessengerCredentialPublic } from "@chatbotx.io/database/partials"
import { generateAuthUrl } from "@chatbotx.io/integration-messenger"
import { env } from "@/env"
import { getOriginUrlFromHeader } from "@/lib/domain"

export async function generateMessengerRedirectUri(
  publicConfig: MessengerCredentialPublic,
  workspaceId?: string | null,
) {
  // The OAuth redirect_uri must be registered in the (platform) Facebook app.
  // A white-label custom domain is not registered there, so we always send
  // Facebook to the fixed platform callback and recover the originating branded
  // domain from `referer` (the callback relays back to it).
  const redirectUrl = new URL(
    "/integrations/messenger/callback",
    env.NEXT_PUBLIC_BUILDER_URL,
  ).toString()
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
