import { logger } from "../logger"
import { messageService } from "./service"

export type CustomFieldActivityChange = {
  customFieldId: string
  customFieldName: string
  oldValue: string | null
  newValue: string
}

export type CustomFieldActivityContext = {
  conversationId: string
  contactInboxId: string
  /** Keyword from flow steps that reference fields by name instead of id. */
  fieldKeyword?: string
}

export async function recordCustomFieldChangeActivities({
  workspaceId,
  conversationId,
  contactInboxId,
  changes,
  fieldKeyword,
}: {
  workspaceId: string
  conversationId?: string | null
  contactInboxId?: string | null
  changes: CustomFieldActivityChange[]
  fieldKeyword?: string
}): Promise<void> {
  if (!(conversationId && contactInboxId) || changes.length === 0) {
    return
  }

  for (const change of changes) {
    await messageService
      .createActivity({
        workspaceId,
        conversationId,
        contactInboxId,
        text: `Custom field changed: ${change.customFieldName}\nNew value: ${change.newValue}`,
        contentAttributes: {
          activityType: "custom_field_changed",
          customFieldId: change.customFieldId,
          customFieldName: change.customFieldName,
          oldValue: change.oldValue,
          newValue: change.newValue,
          ...(fieldKeyword ? { fieldKeyword } : {}),
        },
      })
      .catch((err) => {
        logger.warn({ err }, "Failed to create custom field activity message")
      })
  }
}
