import type { OrganizationSettings } from "@chatbotx.io/database/partials"
import { generateAuthUrl } from "@chatbotx.io/integration-zalo"
import { headers } from "next/headers"

export async function generateZaloRedirectUri(
  settings: NonNullable<OrganizationSettings["zalo"]>,
  workspaceId?: string | null,
) {
  const headersList = await headers()
  const xUrl = headersList.get("x-url")
  const baseUrl =
    process.env.NEXT_PUBLIC_BUILDER_URL ||
    (xUrl ? new URL(xUrl).origin : "") ||
    (typeof window === "undefined" ? "" : window.location.origin)

  const redirectUrl = new URL("/integrations/zalo/callback", baseUrl).toString()
  const referer = workspaceId
    ? new URL(`/space/${workspaceId}/dashboard`, baseUrl).toString()
    : baseUrl

  return generateAuthUrl({
    ...settings,
    redirectUrl,
    stateParams: {
      workspaceId,
      referer: encodeURIComponent(referer),
    },
  })
}
