import { and, db, eq, findOrFail, inArray } from "@aha.chat/database/client"
import {
  contactCustomFieldModel,
  contactModel,
  contactNoteModel,
  contactsToTagsModel,
  conversationModel,
  tagModel,
} from "@aha.chat/database/schema"
import type { ConversationModel } from "@aha.chat/database/types"
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
import {
  emitCustomFieldChanged,
  emitTagApplied,
  emitTagRemoved,
} from "@chatbotx/events"
import { createId } from "@paralleldrive/cuid2"
import { getInboxWithAuthFromInboxId } from "../../lib/inbox"
import { allIntegrations } from "../../lib/integrations"
import type { ExecuteStepProps } from "./flow"

export async function setContactCustomField({
  conversation,
  step,
}: ExecuteStepProps<SetCustomFieldStepSchema>) {
  // Get old value before update
  const existingField = await db.query.contactCustomFieldModel.findFirst({
    where: {
      contactId: conversation.contactId,
      customFieldId: step.inputCfId,
    },
  })
  const oldValue = existingField?.value ?? null

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

  // Emit custom field changed event
  const customField = await db.query.customFieldModel.findFirst({
    where: { id: step.inputCfId },
  })
  if (customField) {
    try {
      await emitCustomFieldChanged(
        conversation.chatbotId,
        conversation.contactId,
        step.inputCfId,
        customField.name,
        oldValue,
        step.value,
      )
    } catch (error) {
      console.error("Failed to emit customFieldChanged event:", error)
    }
  }
}

export async function clearContactCustomField({
  conversation,
  step,
}: ExecuteStepProps<ClearCustomFieldStepSchema>) {
  // Get old value before delete
  const existingField = await db.query.contactCustomFieldModel.findFirst({
    where: {
      contactId: conversation.contactId,
      customFieldId: step.inputCfId,
    },
  })
  const oldValue = existingField?.value ?? null

  await db
    .delete(contactCustomFieldModel)
    .where(
      and(
        eq(contactCustomFieldModel.contactId, conversation.contactId),
        eq(contactCustomFieldModel.customFieldId, step.inputCfId),
      ),
    )

  // Emit custom field changed event
  const customField = await db.query.customFieldModel.findFirst({
    where: { id: step.inputCfId },
  })
  if (customField) {
    try {
      await emitCustomFieldChanged(
        conversation.chatbotId,
        conversation.contactId,
        step.inputCfId,
        customField.name,
        oldValue,
        null,
      )
    } catch (error) {
      console.error("Failed to emit customFieldChanged event:", error)
    }
  }
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
  const insertedTags: { id: string }[] = []

  await db.transaction(async (tx) => {
    await tx
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

    const existingTags = await tx
      .select()
      .from(tagModel)
      .where(
        and(
          eq(tagModel.chatbotId, conversation.chatbotId),
          inArray(tagModel.name, step.tags),
        ),
      )

    if (existingTags.length > 0) {
      await tx
        .insert(contactsToTagsModel)
        .values(
          existingTags.map((t) => ({
            contactId: conversation.contactId,
            tagId: t.id,
          })),
        )
        .onConflictDoNothing()

      insertedTags.push(...existingTags.map((t) => ({ id: t.id })))
    }
  })

  // Emit tag applied events
  for (const tag of insertedTags) {
    try {
      await emitTagApplied(
        conversation.chatbotId,
        conversation.contactId,
        tag.id,
      )
    } catch (error) {
      console.error("Failed to emit tagApplied event:", error)
    }
  }
}

export async function removeContactTag({
  conversation,
  step,
}: ExecuteStepProps<AddContactTagStepSchema>) {
  const tags = await db.query.tagModel.findMany({
    where: {
      chatbotId: conversation.chatbotId,
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

  // Emit tag removed events
  for (const tag of tags) {
    try {
      await emitTagRemoved(
        conversation.chatbotId,
        conversation.contactId,
        tag.id,
      )
    } catch (error) {
      console.error("Failed to emit tagRemoved event:", error)
    }
  }
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
    allIntegrations[inbox.channel]?.channels?.channel?.contact?.block?.({
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
    allIntegrations[inbox.channel]?.channels?.channel?.contact?.unblock?.({
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
