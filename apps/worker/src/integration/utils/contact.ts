import { contactCustomFieldService } from "@chatbotx.io/business"
import { db } from "@chatbotx.io/database/client"
import type { ContactInboxModel } from "@chatbotx.io/database/types"
import { getStoragePrefix, uploader } from "@chatbotx.io/filesystem"
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

export async function readCustomFieldValue(props: {
  contactId: string
  customFieldId: string
}): Promise<string | null> {
  const { contactId, customFieldId } = props

  const existing = await db.query.contactCustomFieldModel.findFirst({
    where: {
      contactId,
      customFieldId,
    },
  })

  return existing?.value ?? null
}

export async function saveResultToCustomField(props: {
  contactId: string
  customFieldId: string
  fullText: string
  workspaceId: string
}) {
  const { contactId, customFieldId, fullText, workspaceId } = props

  await contactCustomFieldService.setValues({
    workspaceId,
    contactId,
    fields: [{ customFieldId, value: fullText }],
  })
}
