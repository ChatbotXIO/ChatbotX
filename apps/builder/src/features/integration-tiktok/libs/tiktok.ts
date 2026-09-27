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
  // The channels settings page, not the bare `/space/{id}` landing — that page
  // redirects to whichever section the member can access and drops the query
  // string on the way, so an `?error=` the callback relays back would never
  // reach `useChannelConnectError`. The index preserves every param but
  // `channel` when it forwards to `settings/channels/tiktok`. Matches Threads.
  const referer = workspaceId
    ? new URL(
        `/space/${workspaceId}/settings/channels?channel=tiktok`,
        baseUrl,
      ).toString()
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
