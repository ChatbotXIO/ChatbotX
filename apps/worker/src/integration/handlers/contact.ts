import { contactTrackingService } from "@chatbotx.io/analytics"
import { and, db, eq, inArray } from "@chatbotx.io/database/client"
import {
  contactCustomFieldModel,
  contactModel,
  contactNoteModel,
  contactsOnSequenceModel,
  contactsToTagsModel,
  conversationModel,
  tagModel,
} from "@chatbotx.io/database/schema"
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
  SubscribeSequenceStepSchema,
  UnsubscribeSequenceStepSchema,
} from "@chatbotx.io/flow-config"
import {
  cancelPendingDispatches,
  enrollContactInSequence,
} from "@chatbotx.io/sequence-scheduler"
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

  // Emit custom field changed event
  const customField = await db.query.customFieldModel.findFirst({
    where: { id: step.inputFieldId },
  })
  if (customField) {
    try {
      await emitCustomFieldChanged(
        conversation.workspaceId,
        conversation.contactId,
        step.inputFieldId,
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

  // Emit custom field changed event
  const customField = await db.query.customFieldModel.findFirst({
    where: { id: step.inputFieldId },
  })
  if (customField) {
    try {
      await emitCustomFieldChanged(
        conversation.workspaceId,
        conversation.contactId,
        step.inputFieldId,
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
  const insertedTags: { id: string }[] = []

  await db.transaction(async (tx) => {
    await tx
      .insert(tagModel)
      .values(
        step.tags.map((t) => ({
          name: t,
          workspaceId: conversation.workspaceId,
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
          eq(tagModel.workspaceId, conversation.workspaceId),
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
        conversation.workspaceId,
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
      workspaceId: conversation.workspaceId,
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
        conversation.workspaceId,
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

  contactTrackingService
    .trackEvents(
      contactInboxes.map((contactInbox) => ({
        workspaceId: conversation.workspaceId,
        contactId: conversation.contactId,
        eventType: "contact_deleted",
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
      })),
    )
    .catch((error) => {
      console.error("[deleteContact] Failed to track contact_deleted", error)
    })
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

  const enrollments = await db.query.contactsOnSequenceModel.findMany({
    where: {
      contactId: conversation.contactId,
      sequenceId: step.sequenceId,
      workspaceId: conversation.workspaceId,
    },
    columns: {
      id: true,
    },
  })

  if (enrollments.length === 0) {
    return
  }

  await db.delete(contactsOnSequenceModel).where(
    and(
      inArray(
        contactsOnSequenceModel.id,
        enrollments.map((e) => e.id),
      ),
      eq(contactsOnSequenceModel.workspaceId, conversation.workspaceId),
    ),
  )

  for (const enrollment of enrollments) {
    await cancelPendingDispatches({
      enrollmentId: enrollment.id,
      workspaceId: conversation.workspaceId,
      reason: "unsubscribed_via_flow",
    })
  }
}
