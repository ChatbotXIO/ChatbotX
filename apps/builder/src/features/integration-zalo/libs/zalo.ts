import type { ZaloCredentialPublic } from "@chatbotx.io/database/partials"
import { generateAuthUrl } from "@chatbotx.io/integration-zalo"
import { getOriginUrlFromHeader } from "@/lib/domain"

export async function generateZaloRedirectUri(
  publicConfig: ZaloCredentialPublic,
  workspaceId?: string | null,
) {
  const baseUrl = await getOriginUrlFromHeader()

  const redirectUrl = new URL("/integrations/zalo/callback", baseUrl).toString()
  const referer = workspaceId
    ? new URL(`/space/${workspaceId}/dashboard`, baseUrl).toString()
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
