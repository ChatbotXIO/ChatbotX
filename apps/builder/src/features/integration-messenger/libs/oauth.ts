import type { MessengerCredentialPublic } from "@chatbotx.io/database/partials"
import { generateAuthUrl } from "@chatbotx.io/integration-messenger"
import { getOriginFromHeader } from "@/lib/domain"
import { buildBrokerCallbackUrl } from "@/lib/oauth-broker"

/**
 * Where a Messenger OAuth flow returns the user once tokens are stored — the
 * workspace's space if known, otherwise the current origin. Shared by the
 * OAuth "Connect" redirect and the SSO-token reuse short-circuit, both of
 * which need to build the same `FacebookAuthCallback.referer`.
 */
export async function buildMessengerReferer(
  workspaceId?: string | null,
): Promise<string> {
  const baseUrl = await getOriginFromHeader()
  return workspaceId
    ? new URL(`/space/${workspaceId}`, baseUrl).toString()
    : baseUrl
}

export async function generateMessengerRedirectUri(
  publicConfig: MessengerCredentialPublic,
  workspaceId?: string | null,
) {
  // The OAuth redirect_uri must be registered in the Facebook app (platform or
  // reseller-owned). A white-label custom domain is not registered there, so we
  // always send Facebook to the fixed broker callback and recover the originating
  // branded domain from `referer` (the callback relays back to it).
  const redirectUrl = buildBrokerCallbackUrl("/integrations/messenger/callback")
  const referer = await buildMessengerReferer(workspaceId)

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
