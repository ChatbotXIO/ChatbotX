"use server"

import { db, eq, findOrFail, sql } from "@aha.chat/database/client"
import {
  chatbotUsageModel,
  contactModel,
  conversationModel,
  inboxModel,
} from "@aha.chat/database/schema"
import type { ChatbotUsageModel, InboxModel } from "@aha.chat/database/types"
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
    { chatbotId, inboxType: "webchat" },
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
        source: inbox.inboxType,
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
      inboxType: inbox.inboxType,
      chatbotId,
      contactId: newContact.id,
      inboxId: inbox.id,
      id: createId(),
    })

    return newContact
  })

  revalidateCacheTags([
    `chatbots:${chatbotId}#contacts`,
    `chatbots:${chatbotId}#conversations`,
  ])

  return contact
}
