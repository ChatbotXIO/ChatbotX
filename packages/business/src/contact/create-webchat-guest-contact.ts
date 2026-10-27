import { contactSources } from "@chatbotx.io/database/partials"
import {
  contactInboxModel,
  contactModel,
  conversationModel,
} from "@chatbotx.io/database/schema"
import { emitContactCreated } from "@chatbotx.io/events"
import { createId } from "@chatbotx.io/utils"
import { randomString } from "remeda"
import { finalizeContactProfile } from "../contact-locale"
import { ChatbotXException } from "../errors"
import { messageCleanupService } from "../message-cleanup/service"
import { quotaEnforcementService } from "../quota-enforcement/service"

type CreateWebchatGuestContactInput = {
  inboxId: string
  ownerId: string
  profile: {
    locale?: string
    timezone?: string
    webchatParentUrl?: string
  }
  sourceId: string
  workspaceId: string
}

export const createWebchatGuestContact = async ({
  inboxId,
  ownerId,
  profile,
  sourceId,
  workspaceId,
}: CreateWebchatGuestContactInput) => {
  const finalizedProfile = finalizeContactProfile(profile)
  const result = await quotaEnforcementService.createNewContactWithMac({
    ownerId,
    workspaceId,
    create: async (tx) => {
      const contact = await tx
        .insert(contactModel)
        .values({
          id: createId(),
          workspaceId,
          email: sourceId,
          gender: "unknown",
          firstName: "Guest",
          lastName: randomString(10),
          locale: finalizedProfile.locale,
          timezone: finalizedProfile.timezone,
        })
        .returning()
        .then((rows) => rows[0])
      if (!contact) {
        throw new ChatbotXException("Contact not found")
      }

      const contactInbox = await tx
        .insert(contactInboxModel)
        .values({
          id: createId(),
          inboxId,
          contactId: contact.id,
          originalContactId: contact.id,
          source: contactSources.enum.webchat,
          sourceId,
          channel: "webchat",
          language: finalizedProfile.language,
          webchatParentUrl: profile.webchatParentUrl,
        })
        .returning()
        .then((rows) => rows[0])
      if (!contactInbox) {
        throw new ChatbotXException("Contact inbox not found")
      }

      await messageCleanupService.cancelByInboxSource({
        inboxId,
        sourceIds: [contactInbox.sourceId],
        tx,
      })

      const conversation = await tx
        .insert(conversationModel)
        .values({
          id: createId(),
          workspaceId,
          contactId: contact.id,
        })
        .returning()
        .then((rows) => rows[0])
      if (!conversation) {
        throw new ChatbotXException("Conversation not found")
      }

      return {
        value: { contact, contactInbox, conversation },
        contactId: contact.id,
        contactInboxId: contactInbox.id,
        inboxId,
      }
    },
  })

  if (result.ok) {
    await emitContactCreated(
      workspaceId,
      result.value.contact.id,
      result.value.contact.firstName || undefined,
      result.value.contact.phoneNumber || undefined,
      result.value.contact.email || undefined,
      result.value.contactInbox.id,
    )
  }

  return result
}
