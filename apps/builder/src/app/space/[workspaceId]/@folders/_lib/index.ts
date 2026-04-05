import { type FolderType, folderTypes } from "@chatbotx.io/database/partials"

export function getFolderTypeFromFeature(
  featureName?: string,
): FolderType | null {
  if (!featureName) {
    return null
  }

  switch (featureName) {
    case "automated-responses":
      return folderTypes.enum.automatedResponse
    case "sequences":
      return folderTypes.enum.sequence
    case "flows":
      return folderTypes.enum.flow
    case "account-fields":
    case "custom-fields":
      return folderTypes.enum.customField
    case "tags":
      return folderTypes.enum.tag
    case "triggers":
      return folderTypes.enum.trigger
    case "webhooks":
      return folderTypes.enum.webhook
    default:
      return null
  }
}
