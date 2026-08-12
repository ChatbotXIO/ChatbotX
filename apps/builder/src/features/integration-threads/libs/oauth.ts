import type { ThreadsCredentialPublic } from "@chatbotx.io/database/partials"
import { generateAuthUrl } from "@chatbotx.io/integration-threads"
import { getOriginFromHeader } from "@/lib/domain"
import { buildBrokerCallbackUrl } from "@/lib/oauth-broker"

export async function generateThreadsRedirectUri(
  publicConfig: ThreadsCredentialPublic,
  workspaceId?: string | null,
) {
  const redirectUrl = buildBrokerCallbackUrl("/integrations/threads/callback")
  const baseUrl = await getOriginFromHeader()
  const referer = workspaceId
    ? new URL(
        `/space/${workspaceId}/settings/channels?channel=threads`,
        baseUrl,
      ).toString()
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
