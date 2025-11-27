import type { OrganizationModel } from "@aha.chat/database/types"
import { env } from "@/env"

export function getOrganizationLogoUrl(organization: OrganizationModel) {
  return organization.logo
    ? new URL(organization.logo, env.NEXT_PUBLIC_ASSET_URL).toString()
    : undefined
}
