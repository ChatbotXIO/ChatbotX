import { FolderType } from "@aha.chat/database"

export function getFolderTypeFromFeature(
  featureName?: string,
): FolderType | null {
  if (!featureName) {
    return null
  }

  switch (featureName) {
    case "automated-responses":
      return FolderType.AUTOMATED_RESPONSE
    case "flows":
      return FolderType.FLOW
    case "account-fields":
    case "custom-fields":
      return FolderType.CUSTOM_FIELD
    case "email-campaigns":
      return FolderType.EMAIL_CAMPAIGN
    case "tags":
      return FolderType.TAG
    default:
      return null
  }
}
