import type { FolderType } from "@chatbotx.io/database/enums"

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
    case "triggers":
      return "trigger"
    case "webhooks":
      return "webhook"
    default:
      return null
  }
}
