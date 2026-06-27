import { tagSyncService } from "@chatbotx.io/business"
import { contactSequenceService } from "@chatbotx.io/business/contact-sequence"
import { and, db, eq, inArray, isNull } from "@chatbotx.io/database/client"
import {
  contactCustomFieldModel,
  contactModel,
  contactNoteModel,
  contactsToTagsModel,
  conversationModel,
  tagModel,
} from "@chatbotx.io/database/schema"
import { emit } from "@chatbotx.io/event-bus"
import {
  emitCustomFieldChanged,
  emitTagApplied,
  emitTagRemoved,
} from "@chatbotx.io/events"
import type {
  AddContactTagStepSchema,
  AddNotesStepSchema,
  ClearCustomFieldStepSchema,
  DeleteContactStepSchema,
  MarkEmailVerifiedStepSchema,
  OptInEmailStepSchema,
  OptOutEmailStepSchema,
  SetCustomFieldStepSchema,
  SubscribeBroadcastStepSchema,
  SubscribeSequenceStepSchema,
  UnsubscribeBroadcastStepSchema,
  UnsubscribeSequenceStepSchema,
} from "@chatbotx.io/flow-config"
import { enrollContactInSequence } from "@chatbotx.io/sequence-scheduler"
import { createId } from "@chatbotx.io/utils"
import type { ExecuteStepProps } from "./flow"

export async function setContactCustomField({
  conversation,
  step,
}: ExecuteStepProps<SetCustomFieldStepSchema>) {
  // Get old value before update
  const existingField = await db.query.contactCustomFieldModel.findFirst({
    where: {
      contactId: conversation.contactId,
      customFieldId: step.inputFieldId,
    },
  })
  const oldValue = existingField?.value ?? null

  await db
    .insert(contactCustomFieldModel)
    .values({
      contactId: conversation.contactId,
      customFieldId: step.inputFieldId,
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

  const customField = await db.query.customFieldModel.findFirst({
    where: { id: step.inputFieldId },
  })
  if (customField) {
    await emitCustomFieldChanged(
      conversation.workspaceId,
      conversation.contactId,
      step.inputFieldId,
      customField.name,
      oldValue,
      step.value,
    )
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
      customFieldId: step.inputFieldId,
    },
  })
  const oldValue = existingField?.value ?? null

  await db
    .delete(contactCustomFieldModel)
    .where(
      and(
        eq(contactCustomFieldModel.contactId, conversation.contactId),
        eq(contactCustomFieldModel.customFieldId, step.inputFieldId),
      ),
    )

  const customField = await db.query.customFieldModel.findFirst({
    where: { id: step.inputFieldId },
  })
  if (customField) {
    await emitCustomFieldChanged(
      conversation.workspaceId,
      conversation.contactId,
      step.inputFieldId,
      customField.name,
      oldValue,
      null,
    )
  }
}

export async function addContactNotes({
  conversation,
  step,
}: ExecuteStepProps<AddNotesStepSchema>) {
  await db.insert(contactNoteModel).values({
    contactId: conversation.contactId,
    text: step.text,
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
  await attachTagsByNames(
    conversation.workspaceId,
    conversation.contactId,
    step.tags,
  )
}

export async function attachTagsByNames(
  workspaceId: string,
  contactId: string,
  tagNames: string[],
): Promise<void> {
  if (tagNames.length === 0) {
    return
  }

  const newlyLinkedTagIds: string[] = []

  await db.transaction(async (tx) => {
    await tx
      .insert(tagModel)
      .values(
        tagNames.map((t) => ({
          name: t,
          workspaceId,
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
          eq(tagModel.workspaceId, workspaceId),
          inArray(tagModel.name, tagNames),
        ),
      )

    if (existingTags.length > 0) {
      // Capture only the pairs that were actually inserted so we mirror /
      // emit exactly once per newly-applied tag (not for pre-existing links).
      const linked = await tx
        .insert(contactsToTagsModel)
        .values(
          existingTags.map((t) => ({
            contactId,
            tagId: t.id,
          })),
        )
        .onConflictDoNothing()
        .returning({ tagId: contactsToTagsModel.tagId })

      newlyLinkedTagIds.push(...linked.map((l) => l.tagId))
    }
  })

  // Enqueue tag-sync + emit events outside the transaction (pure Redis push).
  for (const tagId of newlyLinkedTagIds) {
    await tagSyncService.enqueueAttach({
      workspaceId,
      contactId,
      tagId,
    })
  }

  await Promise.all(
    newlyLinkedTagIds.map((tagId) =>
      emitTagApplied(workspaceId, contactId, tagId),
    ),
  )
}

export async function removeContactTag({
  conversation,
  step,
}: ExecuteStepProps<AddContactTagStepSchema>) {
  await detachTagsByNames(
    conversation.workspaceId,
    conversation.contactId,
    step.tags,
  )
}

export async function detachTagsByNames(
  workspaceId: string,
  contactId: string,
  tagNames: string[],
): Promise<void> {
  if (tagNames.length === 0) {
    return
  }

  const tags = await db.query.tagModel.findMany({
    where: {
      workspaceId,
      name: {
        in: tagNames,
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
      eq(contactsToTagsModel.contactId, contactId),
      inArray(
        contactsToTagsModel.tagId,
        tags.map((t) => t.id),
      ),
    ),
  )

  // Enqueue channel detach (unassign + ContactToTagChannel cleanup runs in the
  // queue). Detach is idempotent, so it is safe to enqueue per resolved tag.
  for (const tag of tags) {
    await tagSyncService.enqueueDetach({
      workspaceId,
      contactId,
      tagId: tag.id,
    })
  }

  await Promise.all(
    tags.map((tag) => emitTagRemoved(workspaceId, contactId, tag.id)),
  )
}

export async function deleteContact({
  conversation,
}: ExecuteStepProps<DeleteContactStepSchema>) {
  const contactInboxes = await db.query.contactInboxModel.findMany({
    where: {
      contactId: conversation.contactId,
    },
  })
  const occurredAt = new Date()

  await db.transaction(async (tx) => {
    await tx
      .delete(conversationModel)
      .where(eq(conversationModel.id, conversation.id))

    await tx
      .delete(contactModel)
      .where(eq(contactModel.id, conversation.contactId))
  })

  for (const contactInbox of contactInboxes) {
    if (contactInbox.sourceId) {
      emit("analytics:dashboard", {
        eventType: "contact:deleted",
        workspaceId: conversation.workspaceId,
        contactId: contactInbox.id,
        occurredAt,
        source: contactInbox.source,
        sourceId: contactInbox.sourceId,
        channel: contactInbox.channel,
        metadata: {
          triggerContext: {
            triggerSource: "worker",
            triggerHandler: "deleteContact",
            triggerType: "contact_deleted",
          },
        },
      })
    }
  }
}

export async function addContactSequence({
  conversation,
  step,
}: ExecuteStepProps<SubscribeSequenceStepSchema>) {
  if (!step.sequenceId) {
    return
  }

  const existing = await db.query.contactsOnSequenceModel.findFirst({
    where: {
      contactId: conversation.contactId,
      sequenceId: step.sequenceId,
      workspaceId: conversation.workspaceId,
    },
    columns: { id: true },
  })

  if (existing) {
    return
  }

  const now = new Date()

  const firstStep = await db.query.sequenceStepModel.findFirst({
    where: {
      sequenceId: step.sequenceId,
      order: 0,
      isActive: true,
    },
    columns: {
      id: true,
      delayDays: true,
      delayMinutes: true,
    },
  })

  const nextRunAt = firstStep
    ? new Date(
        now.getTime() +
          firstStep.delayDays * 24 * 60 * 60 * 1000 +
          firstStep.delayMinutes * 60 * 1000,
      )
    : now

  await enrollContactInSequence({
    workspaceId: conversation.workspaceId,
    contactId: conversation.contactId,
    sequenceId: step.sequenceId,
    nextRunAt,
    nextStepId: firstStep?.id ?? null,
    enrolledAt: now,
  })
}

export async function removeContactSequence({
  conversation,
  step,
}: ExecuteStepProps<UnsubscribeSequenceStepSchema>) {
  if (!step.sequenceId) {
    return
  }

  await contactSequenceService.removeContactSequencesForContact({
    workspaceId: conversation.workspaceId,
    contactId: conversation.contactId,
    sequenceIds: [step.sequenceId],
    reason: "unsubscribed_via_flow",
  })
}

export async function subscribeBroadcast({
  conversation,
}: ExecuteStepProps<SubscribeBroadcastStepSchema>) {
  await db
    .update(contactModel)
    .set({ broadcastSubscribedAt: new Date() })
    .where(
      and(
        eq(contactModel.id, conversation.contactId),
        eq(contactModel.workspaceId, conversation.workspaceId),
        isNull(contactModel.broadcastSubscribedAt),
      ),
    )
}

export async function unsubscribeBroadcast({
  conversation,
}: ExecuteStepProps<UnsubscribeBroadcastStepSchema>) {
  await db
    .update(contactModel)
    .set({ broadcastSubscribedAt: null })
    .where(
      and(
        eq(contactModel.id, conversation.contactId),
        eq(contactModel.workspaceId, conversation.workspaceId),
      ),
    )
}
