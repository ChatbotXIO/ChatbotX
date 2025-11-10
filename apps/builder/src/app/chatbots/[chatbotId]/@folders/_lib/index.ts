import { FolderType } from "@aha.chat/database"

export function getFolderTypeFromFeature(
  featureName?: string,
): FolderType | null {
  if (!featureName) {
    return null
  }

  switch (featureName) {
    case "automated-responses":
      return FolderType.automatedResponse
    case "flows":
      return FolderType.flow
    case "account-fields":
    case "custom-fields":
      return FolderType.customField
    case "tags":
      return FolderType.tag
    default:
      return null
  }
}
