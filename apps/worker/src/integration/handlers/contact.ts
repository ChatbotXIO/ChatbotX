import {
  adsConversionService,
  contactCustomFieldService,
  contactService,
  tagSyncService,
} from "@chatbotx.io/business"
import { contactSequenceService } from "@chatbotx.io/business/contact-sequence"
import { and, db, eq, inArray, isNull } from "@chatbotx.io/database/client"
import {
  contactModel,
  contactNoteModel,
  contactsToTagsModel,
  tagModel,
} from "@chatbotx.io/database/schema"
import { emit } from "@chatbotx.io/event-bus"
import {
  emitContactUnsubscribed,
  emitSequenceSubscribed,
  emitTagApplied,
  emitTagRemoved,
} from "@chatbotx.io/events"
import type {
  AddContactNotesStepSchema,
  AddContactTagStepSchema,
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
import { TemporalInputParsing } from "@chatbotx.io/utils/datetime"
import { contactVariableService } from "@chatbotx.io/variables"
import type { ExecuteStepProps } from "./flow"

export async function setContactCustomField({
  conversation,
  contactInbox,
  step,
}: ExecuteStepProps<SetCustomFieldStepSchema>) {
  // The value can contain {{variable}} tokens inserted via the editor (contact
  // fields, coupons, etc.); resolve them against this contact before persisting.
  // Unresolvable tokens are left as-is, and a value that resolves to empty still
  // falls through to the temporal "now" handling below.
  const variables = await contactVariableService.getAll({
    contactId: conversation.contactId,
    contactInbox,
    conversation,
  })
  const resolvedValue = await contactVariableService.replaceAll({
    text: step.value,
    variables,
  })

  await contactCustomFieldService.setValueByKey({
    workspaceId: conversation.workspaceId,
    contactId: conversation.contactId,
    keyword: step.inputFieldId,
    value: resolvedValue,
    // The editor captured its browser zone at save time; anchor naive
    // date/datetime values to it (worker has no browser context). Lenient
    // parsing accepts flexible user input (unix ts, "23/07/2026", ...), and a
    // blank value stamps "now" in that zone.
    sourceTimezoneOverride: step.timezone,
    temporalInputParsing: TemporalInputParsing.Lenient,
    fillEmptyTemporalWithNow: true,
  })
}

export async function clearContactCustomField({
  conversation,
  step,
}: ExecuteStepProps<ClearCustomFieldStepSchema>) {
  await contactCustomFieldService.deleteByKey({
    workspaceId: conversation.workspaceId,
    contactId: conversation.contactId,
    keyword: step.inputFieldId,
  })
}

export async function addContactNotes({
  conversation,
  step,
}: ExecuteStepProps<AddContactNotesStepSchema>) {
  await db.insert(contactNoteModel).values({
    contactId: conversation.contactId,
    text: step.content,
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
  contactInbox,
  step,
}: ExecuteStepProps<AddContactTagStepSchema>) {
  await attachTagsByNames(
    conversation.workspaceId,
    conversation.contactId,
    step.tags,
    contactInbox,
  )
}

/**
 * Minimal contact-inbox shape `attachTagsByNames` needs to resolve+enqueue
 * the `tagApplied` conversion-trigger evaluation for one specific inbox. A
 * full `ContactInboxModel` satisfies this structurally, so the flow-step
 * `addContactTag` path (which has the full row) needs no change; the
 * rich-response `add_tag` action (MEDIUM-a) only has these three fields in
 * scope and can pass a minimal object instead.
 */
export type TagAttachContactInbox = {
  id: string
  inboxId: string
  channel: string | null
}

export async function attachTagsByNames(
  workspaceId: string,
  contactId: string,
  tagNames: string[],
  contactInbox?: TagAttachContactInbox,
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

  // Ads conversion `tagApplied` trigger: only when the caller already has a
  // specific WhatsApp conversation in scope (the flow-step path) — resolves
  // and enqueues for that one contactInbox rather than fanning out to every
  // other WhatsApp-CTWA inbox the contact might have.
  if (
    contactInbox &&
    newlyLinkedTagIds.length > 0 &&
    adsConversionService.isEligibleChannel(contactInbox.channel)
  ) {
    await adsConversionService.enqueueTagAppliedEvaluationsForInbox({
      workspaceId,
      inboxId: contactInbox.inboxId,
      contactInboxId: contactInbox.id,
      tagIds: newlyLinkedTagIds,
    })
  }
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
  const occurredAt = new Date()

  // Delete through the service so this path shares the tombstone bookkeeping
  // (MessageCleanup) and cache invalidation with the builder bulk delete —
  // Message/Attachment no longer cascade from Contact.
  const [deletedContact] = await contactService.delete({
    workspaceId: conversation.workspaceId,
    ids: [conversation.contactId],
  })

  for (const contactInbox of deletedContact?.contactInboxes ?? []) {
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

  const sequence = await db.query.sequenceModel.findFirst({
    where: { id: step.sequenceId },
    columns: { name: true },
  })

  await emitSequenceSubscribed(
    conversation.workspaceId,
    conversation.contactId,
    step.sequenceId,
    sequence?.name ?? "",
  )
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

  await emitContactUnsubscribed(
    conversation.workspaceId,
    conversation.contactId,
  )
}
