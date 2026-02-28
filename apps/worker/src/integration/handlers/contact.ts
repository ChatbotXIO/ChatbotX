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
import { createId } from "@paralleldrive/cuid2"
import { getInboxWithAuthFromInboxId } from "../../lib/inbox"
import { allIntegrations } from "../../lib/integrations"
import type { ExecuteStepProps } from "./flow"

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
