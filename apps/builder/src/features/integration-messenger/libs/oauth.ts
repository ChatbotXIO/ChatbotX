import type { MessengerCredentialPublic } from "@chatbotx.io/database/partials"
import { generateAuthUrl } from "@chatbotx.io/integration-messenger"
import { getOriginFromHeader } from "@/lib/domain"
import { buildProviderCallbackUrl } from "@/lib/provider-origin"

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
  credential: {
    userId: string | null
    publicConfig: MessengerCredentialPublic
  },
  workspaceId?: string | null,
) {
  // The OAuth redirect_uri must be registered in the Facebook app. For a
  // tenant-owned credential (their own app), that's the reseller's custom
  // domain; otherwise it's the broker, and the originating branded domain is
  // recovered from `referer` (the callback relays back to it).
  const redirectUrl = await buildProviderCallbackUrl(
    credential,
    "/integrations/messenger/callback",
  )
  const referer = await buildMessengerReferer(workspaceId)

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
