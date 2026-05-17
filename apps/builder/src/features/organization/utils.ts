import { ChatbotXException } from "@chatbotx.io/business/errors"
import type { OrganizationModel } from "@chatbotx.io/database/types"
import { usePlatformUrls } from "@/features/platform"

export const useOrganizationLogoUrl = (
  organization: OrganizationModel,
): string | undefined => {
  const { assetUrl } = usePlatformUrls()

  return organization.logo
    ? new URL(organization.logo, assetUrl).toString()
    : undefined
}

export const invalidOrganizationSettingsError = (message: string) =>
  new ChatbotXException(message, "invalidOrganizationSettings")
