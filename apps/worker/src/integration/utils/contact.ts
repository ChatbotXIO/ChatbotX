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
  /**
   * The `ContactInbox` this write originated from, when the caller has one in
   * scope. Threaded to `setValues` so a custom-field trigger fired by this
   * change attributes ads/CAPI actions to the originating integration's inbox
   * instead of falling back to the contact's most-recently-active inbox.
   */
  contactInboxId?: string
}) {
  const { contactId, customFieldId, fullText, workspaceId, contactInboxId } =
    props

  await contactCustomFieldService.setValues({
    workspaceId,
    contactId,
    contactInboxId,
    fields: [{ customFieldId, value: fullText }],
  })
}
