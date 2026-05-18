import { db } from "@chatbotx.io/database/client"
import { contactCustomFieldModel } from "@chatbotx.io/database/schema"
import type { ContactInboxModel } from "@chatbotx.io/database/types"
import { emitCustomFieldChanged } from "@chatbotx.io/events"
import { getStoragePrefix, uploader } from "@chatbotx.io/filesystem"
import { createId } from "@chatbotx.io/utils"
import { integrationService } from "../../services/integrations"

export async function getIntegrationContext(props: {
  workspaceId: string
  contactId: string
  contactInbox?: ContactInboxModel
}) {
  const { workspaceId, contactId, contactInbox: baseContactInbox } = props

  const contactInbox =
    baseContactInbox ||
    (await db.query.contactInboxModel.findFirst({
      where: {
        contactId,
      },
      orderBy: {
        lastMessageAt: "desc",
      },
    }))

  if (!contactInbox) {
    return null
  }

  const integration =
    await integrationService.getIntegrationFromContactInbox(contactInbox)
  const auth = integration.auth

  return {
    contactInbox,
    auth,
    storagePrefix: getStoragePrefix(workspaceId),
    uploader,
  }
}

export async function saveResultToCustomField(props: {
  contactId: string
  customFieldId: string
  fullText: string
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
