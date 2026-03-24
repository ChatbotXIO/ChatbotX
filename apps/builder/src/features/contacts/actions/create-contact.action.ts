"use server"

import { db, eq, findOrFail, sql } from "@aha.chat/database/client"
import {
  chatbotUsageModel,
  contactModel,
  conversationModel,
  inboxModel,
} from "@aha.chat/database/schema"
import {
  type ChatbotUsageModel,
  channelType,
  type InboxModel,
} from "@aha.chat/database/types"
import { emitContactCreated } from "@chatbotx/events"
import { contactTrackingService } from "@chatbotx.io/analytics"
import { createId } from "@paralleldrive/cuid2"
import { returnValidationErrors } from "next-safe-action"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type CreateContactRequest,
  type CreateContactResponse,
  createContactRequest,
} from "../schemas/action"

export const createContactAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(createContactRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: CreateContactRequest
    }) => {
      await createContact({ chatbotId, parsedInput })
    },
  )

export const createContact = async ({
  chatbotId,
  parsedInput,
}: {
  chatbotId: string
  parsedInput: CreateContactRequest
}): Promise<CreateContactResponse> => {
  // Make sure phone number is not exists in the chatbot
  const existedContact = await db.query.contactModel.findFirst({
    where: {
      chatbotId,
      phoneNumber: parsedInput.phoneNumber,
    },
  })
  if (existedContact) {
    return returnValidationErrors(createContactRequest, {
      _errors: ["Validation Exception"],
      phoneNumber: {
        _errors: ["Phone number is exists"],
      },
    })
  }

  const inbox = await findOrFail<InboxModel>(
    inboxModel,
    { chatbotId, channel: channelType.webchat },
    "Inbox not found",
  )

  const chatbotUsage = await findOrFail<ChatbotUsageModel>(
    chatbotUsageModel,
    { chatbotId },
    "Chatbot usage not found",
  )
  if (chatbotUsage.contactsCount >= chatbotUsage.maxContacts) {
    return returnValidationErrors(createContactRequest, {
      _errors: ["Validation Exception"],
      phoneNumber: {
        _errors: ["Max contacts reached"],
      },
    })
  }

  const contact = await db.transaction(async (tx) => {
    const newContact = await tx
      .insert(contactModel)
      .values({
        ...parsedInput,
        chatbotId,
        channel: inbox.channel,
        id: createId(),
      })
      .returning()
      .then((result) => result[0])

    await tx
      .update(chatbotUsageModel)
      .set({
        contactsCount: sql`${chatbotUsageModel.contactsCount} + 1`,
      })
      .where(eq(chatbotUsageModel.chatbotId, chatbotId))

    await tx.insert(conversationModel).values({
      channel: inbox.channel,
      chatbotId,
      contactId: newContact.id,
      inboxId: inbox.id,
      id: createId(),
    })

    return newContact
  })

  // Emit contact created event
  try {
    await emitContactCreated(
      chatbotId,
      contact.id,
      contact.firstName || undefined,
      contact.phoneNumber || undefined,
      contact.email || undefined,
    )
  } catch (error) {
    console.error("Failed to emit contactCreated event:", error)
  }

  if (contact.sourceId) {
    await contactTrackingService.trackEvent(
      {
        chatbotId,
        contactId: contact.sourceId,
        eventType: "contact_created",
        occurredAt: contact.createdAt,
        source: contact.source,
        sourceId: contact.sourceId,
        channel: inbox.channel,
        country: undefined,
        metadata: {
          triggerContext: {
            triggerSource: "api",
            triggerHandler: "createContact",
            triggerType: "contact_created",
          },
        },
      },
      { skipSpooler: true },
    )
  }

  revalidateCacheTags([
    `chatbots:${chatbotId}#contacts`,
    `chatbots:${chatbotId}#conversations`,
  ])

  return contact
}
