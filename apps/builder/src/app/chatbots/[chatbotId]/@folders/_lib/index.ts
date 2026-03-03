import type { FolderType } from "@aha.chat/database/types"

export function getFolderTypeFromFeature(
  featureName?: string,
): FolderType | null {
  if (!featureName) {
    return null
  }

  switch (featureName) {
    case "automated-responses":
      return "automatedResponse"
    case "flows":
      return "flow"
    case "account-fields":
    case "custom-fields":
      return "customField"
    case "tags":
      return "tag"
    default:
      return null
  }
}
