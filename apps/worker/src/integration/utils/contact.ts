import {
  contactCustomFieldService,
  contactInboxService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import type { ContactInboxModel } from "@chatbotx.io/database/types"
import { getStoragePrefix, uploader } from "@chatbotx.io/filesystem"
import { logger } from "../../lib/logger"
import { integrationService } from "../../services/integrations"

export async function getIntegrationContext(props: {
  workspaceId: string
  contactId: string
  contactInbox?: ContactInboxModel
}) {
  const { workspaceId, contactId, contactInbox: baseContactInbox } = props

  const contactInbox =
    baseContactInbox ||
    (await contactInboxService.findRecentByContactId({
      workspaceId,
      contactId,
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

  return await contactCustomFieldService.findValue({ contactId, customFieldId })
}

export async function saveResultToCustomField(props: {
  contactId: string
  /**
   * A ContactCustomField id/name (legacy) or a `bot_field:<id>` reference
   * token — resolved by `setValueByKey` with `allowBotFields: true` so AI
   * and other result steps can save into an Account Field the same way
   * "Set Custom Field" does.
   */
  customFieldId: string
  fullText: string
  workspaceId: string
  /**
   * The `ContactInbox` this write originated from, when the caller has one in
   * scope. Threaded to `setValueByKey` so a custom-field trigger fired by this
   * change attributes ads/CAPI actions to the originating integration's inbox
   * instead of falling back to the contact's most-recently-active inbox.
   */
  contactInboxId?: string
}) {
  const { contactId, customFieldId, fullText, workspaceId, contactInboxId } =
    props

  try {
    await contactCustomFieldService.setValueByKey({
      workspaceId,
      contactId,
      keyword: customFieldId,
      value: fullText,
      contactInboxId,
      allowBotFields: true,
    })
  } catch (error: unknown) {
    // Back-compat: the pre-bot-field `setValues` path silently skipped a
    // since-deleted field id, so a flow pointing at a deleted field completed
    // its step as success. `setValueByKey` throws notFound instead — swallow
    // exactly that case (log for operators) and let every other error
    // propagate to the caller's own handling.
    if (error instanceof ChatbotXException && error.code === "notFound") {
      logger.warn(
        { workspaceId, contactId, customFieldId },
        "saveResultToCustomField target no longer exists; skipping",
      )
      return
    }
    throw error
  }
}
