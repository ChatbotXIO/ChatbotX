import { ChatbotXException } from "@chatbotx.io/business/errors"
import type { OrganizationModel } from "@chatbotx.io/database/types"
import { env } from "@/env"

export const getOrganizationLogoUrl = (organization: OrganizationModel) =>
  organization.logo
    ? new URL(organization.logo, env.NEXT_PUBLIC_ASSET_URL).toString()
    : undefined

export const invalidOrganizationSettingsError = (message: string) =>
  new ChatbotXException(message, "invalidOrganizationSettings")
