import { db } from "@chatbotx.io/database/client"
import { contactCustomFieldModel } from "@chatbotx.io/database/schema"
import { emitCustomFieldChanged } from "@chatbotx.io/events"
import { createId } from "@chatbotx.io/utils"

export async function saveResultToCustomField(props: {
  contactId: string
  customFieldId: string
  fullText: string
  messageCount: number
  workspaceId: string
}) {
  const { contactId, customFieldId, fullText, workspaceId } = props

  // Get old value before update
  const existingField = await db.query.contactCustomFieldModel.findFirst({
    where: {
      contactId,
      customFieldId,
    },
  })
  const oldValue = existingField?.value ?? null

  await db
    .insert(contactCustomFieldModel)
    .values({
      contactId,
      customFieldId,
      value: fullText,
      id: createId(),
    })
    .onConflictDoUpdate({
      target: [
        contactCustomFieldModel.contactId,
        contactCustomFieldModel.customFieldId,
      ],
      set: {
        value: fullText,
      },
    })

  // Emit custom field changed event
  const customField = await db.query.customFieldModel.findFirst({
    where: { id: customFieldId },
  })
  if (customField) {
    try {
      await emitCustomFieldChanged(
        workspaceId,
        contactId,
        customFieldId,
        customField.name,
        oldValue,
        fullText,
      )
    } catch (error) {
      console.error("Failed to emit customFieldChanged event:", error)
    }
  }
}
