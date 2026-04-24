import type { OrganizationSettings } from "@chatbotx.io/database/partials"
import { generateAuthUrl } from "@chatbotx.io/integration-zalo"
import { getOriginUrlFromHeader } from "@/lib/domain"

export async function generateZaloRedirectUri(
  settings: NonNullable<OrganizationSettings["zalo"]>,
  workspaceId?: string | null,
) {
  const baseUrl = await getOriginUrlFromHeader()

  const redirectUrl = new URL("/integrations/zalo/callback", baseUrl).toString()
  const referer = workspaceId
    ? new URL(`/space/${workspaceId}/dashboard`, baseUrl).toString()
    : baseUrl

  return generateAuthUrl({
    ...settings,
    redirectUrl,
    stateParams: {
      workspaceId,
      referer,
    },
  })
}
