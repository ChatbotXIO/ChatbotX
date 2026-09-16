import type { ThreadsCredentialPublic } from "@chatbotx.io/database/partials"
import { generateAuthUrl } from "@chatbotx.io/integration-threads"
import { getOriginFromHeader } from "@/lib/domain"
import { logger } from "@/lib/log"
import { buildProviderCallbackUrl } from "@/lib/provider-origin"

export async function generateThreadsRedirectUri(
  credential: {
    userId: string | null
    publicConfig: ThreadsCredentialPublic
  },
  workspaceId?: string | null,
) {
  // The OAuth redirect_uri must be registered in the Threads app. For a
  // tenant-owned credential (their own app), that's the reseller's custom
  // domain; otherwise it's the broker, and the originating branded domain is
  // recovered from `referer` (the callback relays back to it), matching the
  // other integrations.
  const redirectUrl = await buildProviderCallbackUrl(
    credential,
    "/integrations/threads/callback",
  )
  const baseUrl = await getOriginFromHeader()
  const referer = workspaceId
    ? new URL(
        `/space/${workspaceId}/settings/channels?channel=threads`,
        baseUrl,
      ).toString()
    : baseUrl

  logger.info(
    {
      workspaceId,
      credentialOwnerUserId: credential.userId,
      clientId: credential.publicConfig.clientId || null,
      redirectUrl,
    },
    "Generating Threads OAuth authorize URL",
  )

  return generateAuthUrl({
    clientId: credential.publicConfig.clientId,
    redirectUrl,
    stateParams: {
      workspaceId,
      referer,
    },
  })
}
