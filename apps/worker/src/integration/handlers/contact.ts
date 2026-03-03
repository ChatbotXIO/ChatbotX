import { and, db, eq, findOrFail, inArray } from "@aha.chat/database/client"
import {
  contactCustomFieldModel,
  contactModel,
  contactNoteModel,
  contactsToTagsModel,
  conversationModel,
  tagModel,
} from "@aha.chat/database/schema"
import {
  type ConversationModel,
  type Gender,
  reservedCustomFieldNames,
} from "@aha.chat/database/types"

import type {
  AddContactTagStepSchema,
  AddNotesStepSchema,
  ClearCustomFieldStepSchema,
  DeleteContactStepSchema,
  MarkEmailVerifiedStepSchema,
  OptInEmailStepSchema,
  OptOutEmailStepSchema,
  SetCustomFieldStepSchema,
} from "@aha.chat/flow-config"
import {
  broadcastToChatbotParty,
  RealtimeEventType,
} from "@aha.chat/partysocket-config"
import type {
  IntegrationJobBlockContact,
  IntegrationJobUnblockContact,
} from "@aha.chat/worker-config"
import { createId } from "@paralleldrive/cuid2"
import { getInboxWithAuthFromInboxId } from "../../lib/inbox"
import { allIntegrations } from "../../lib/integrations"
import type { ExecuteStepProps } from "./flow"

export async function saveResultToCustomField({
  contactId,
  customFieldId,
  fullText,
  messageCount,
  chatbotId,
}: {
  contactId: string | null
  customFieldId: string
  fullText: string
  messageCount: number
  chatbotId: string
}): Promise<void> {
  if (!contactId) {
    return
  }
  if (!customFieldId.trim()) {
    return
  }
  if (messageCount === 0) {
    return
  }
  if (!fullText) {
    return
  }

  const isReservedField = Object.values(reservedCustomFieldNames).includes(
    customFieldId as (typeof reservedCustomFieldNames)[keyof typeof reservedCustomFieldNames],
  )

  if (isReservedField) {
    const updateData: Partial<{
      firstName: string
      lastName: string
      email: string
      phoneNumber: string
      avatar: string
      gender: Gender
    }> = {}

    switch (customFieldId) {
      case reservedCustomFieldNames.first_name:
        updateData.firstName = fullText
        break
      case reservedCustomFieldNames.last_name:
        updateData.lastName = fullText
        break
      case reservedCustomFieldNames.full_name: {
        const trimmedName = fullText.trim()
        const spaceIndex = trimmedName.indexOf(" ")
        if (spaceIndex > 0) {
          updateData.firstName = trimmedName.substring(0, spaceIndex)
          updateData.lastName = trimmedName.substring(spaceIndex + 1).trim()
        } else if (trimmedName.length > 0) {
          updateData.firstName = trimmedName
        }
        break
      }
      case reservedCustomFieldNames.email:
        updateData.email = fullText
        break
      case reservedCustomFieldNames.phone_number:
        updateData.phoneNumber = fullText
        break
      case reservedCustomFieldNames.avatar:
        updateData.avatar = fullText
        break
      case reservedCustomFieldNames.gender:
        if (
          fullText === "male" ||
          fullText === "female" ||
          fullText === "unknown"
        ) {
          updateData.gender = fullText as Gender
        }
        break
      default:
        return
    }

    await db
      .update(contactModel)
      .set(updateData)
      .where(eq(contactModel.id, contactId))
    return
  }

  const customField = await db.query.fieldModel.findFirst({
    where: {
      id: customFieldId,
      fieldType: "customField",
      chatbotId,
    },
  })

  if (!customField) {
    return
  }

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
}

export async function setContactCustomField({
  conversation,
  step,
}: ExecuteStepProps<SetCustomFieldStepSchema>) {
  await db
    .insert(contactCustomFieldModel)
    .values({
      contactId: conversation.contactId,
      customFieldId: step.inputCfId,
      value: step.value,
      id: createId(),
    })
    .onConflictDoUpdate({
      target: [
        contactCustomFieldModel.contactId,
        contactCustomFieldModel.customFieldId,
      ],
      set: {
        value: step.value,
      },
    })
}

export async function clearContactCustomField({
  conversation,
  step,
}: ExecuteStepProps<ClearCustomFieldStepSchema>) {
  await db
    .delete(contactCustomFieldModel)
    .where(
      and(
        eq(contactCustomFieldModel.contactId, conversation.contactId),
        eq(contactCustomFieldModel.customFieldId, step.inputCfId),
      ),
    )
}

export async function addContactNotes({
  conversation,
  step,
}: ExecuteStepProps<AddNotesStepSchema>) {
  await db.insert(contactNoteModel).values({
    contactId: conversation.contactId,
    content: step.content,
    id: createId(),
  })
}

export async function markEmailVerified({
  conversation,
}: ExecuteStepProps<MarkEmailVerifiedStepSchema>) {
  await db
    .update(contactModel)
    .set({
      emailVerified: true,
    })
    .where(eq(contactModel.id, conversation.contactId))
}

export async function optInEmail({
  conversation,
}: ExecuteStepProps<OptInEmailStepSchema>) {
  await db
    .update(contactModel)
    .set({
      emailOptIn: true,
    })
    .where(eq(contactModel.id, conversation.contactId))
}

export async function optOutEmail({
  conversation,
}: ExecuteStepProps<OptOutEmailStepSchema>) {
  await db
    .update(contactModel)
    .set({
      emailOptIn: false,
    })
    .where(eq(contactModel.id, conversation.contactId))
}

export async function addContactTag({
  conversation,
  step,
}: ExecuteStepProps<AddContactTagStepSchema>) {
  await db.transaction(async (tx) => {
    const tags = await tx
      .insert(tagModel)
      .values(
        step.tags.map((t) => ({
          name: t,
          chatbotId: conversation.chatbotId,
          id: createId(),
        })),
      )
      .onConflictDoNothing()
      .returning()

    await tx
      .insert(contactsToTagsModel)
      .values(
        tags.map((t) => ({
          contactId: conversation.contactId,
          tagId: t.id,
        })),
      )
      .onConflictDoNothing()
  })
}

export async function removeContactTag({
  conversation,
  step,
}: ExecuteStepProps<AddContactTagStepSchema>) {
  const tags = await db.query.tagModel.findMany({
    where: {
      chatbotId: conversation.id,
      name: {
        in: step.tags,
      },
    },
    columns: {
      id: true,
    },
  })
  if (tags.length === 0) {
    return
  }

  await db.delete(contactsToTagsModel).where(
    and(
      eq(contactsToTagsModel.contactId, conversation.contactId),
      inArray(
        contactsToTagsModel.tagId,
        tags.map((t) => t.id),
      ),
    ),
  )
}

export async function deleteContact({
  conversation,
}: ExecuteStepProps<DeleteContactStepSchema>) {
  await db.transaction(async (tx) => {
    await tx
      .delete(conversationModel)
      .where(eq(conversationModel.id, conversation.id))

    await tx
      .delete(contactModel)
      .where(eq(contactModel.id, conversation.contactId))
  })
}

export const broadcastBlockContactEvent = async ({
  contact,
}: IntegrationJobBlockContact["data"]) => {
  const firstConversation = await findOrFail<ConversationModel>(
    conversationModel,
    {
      contactId: contact.id,
    },
    "Conversation not found",
  )
  const { inbox, auth } = await getInboxWithAuthFromInboxId(
    firstConversation.inboxId,
  )

  const promises = [
    allIntegrations[inbox.inboxType]?.channels?.channel?.contact?.block?.({
      ctx: {
        chatbot: inbox.chatbot,
        auth,
      },
      data: {
        contact,
      },
    }),
    broadcastToChatbotParty(inbox.chatbotId, {
      eventType: RealtimeEventType.contactBlocked,
      data: {
        contactId: contact.id,
      },
    }),
  ]

  await Promise.all(promises)
}

export const broadcastUnblockContactEvent = async ({
  contact,
}: IntegrationJobUnblockContact["data"]) => {
  const firstConversation = await findOrFail<ConversationModel>(
    conversationModel,
    {
      contactId: contact.id,
    },
    "Conversation not found",
  )
  const { inbox, auth } = await getInboxWithAuthFromInboxId(
    firstConversation.inboxId,
  )

  const promises = [
    allIntegrations[inbox.inboxType]?.channels?.channel?.contact?.unblock?.({
      ctx: {
        chatbot: inbox.chatbot,
        auth,
      },
      data: {
        contact,
      },
    }),
    broadcastToChatbotParty(inbox.chatbotId, {
      eventType: RealtimeEventType.contactUnblocked,
      data: {
        contactId: contact.id,
      },
    }),
  ]

  await Promise.all(promises)
}
