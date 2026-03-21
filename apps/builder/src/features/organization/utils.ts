import type { OrganizationModel } from "@aha.chat/database/types"
import { env } from "@/env"
import { ChatbotXException } from "../../lib/errors/exception"

export const getOrganizationLogoUrl = (organization: OrganizationModel) => {
  return organization.logo
    ? new URL(organization.logo, env.NEXT_PUBLIC_ASSET_URL).toString()
    : undefined
}

export const invalidOrganizationSettingsError = (message: string) =>
  new ChatbotXException(message, "invalidOrganizationSettings")
