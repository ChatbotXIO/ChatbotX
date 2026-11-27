import {
  contactCustomFieldService,
  contactNoteService,
  contactService,
  tagService,
} from "@chatbotx.io/business"
import { contactSequenceService } from "@chatbotx.io/business/contact-sequence"
import { leaderboardScoringService } from "@chatbotx.io/business/leaderboard"
import { emitContactUnsubscribed } from "@chatbotx.io/events"
import type {
  AddContactNotesStepSchema,
  AddContactTagStepSchema,
  ChangeGamificationScoreStepSchema,
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
import { TemporalInputParsing } from "@chatbotx.io/utils/datetime"
import { logger } from "../../lib/logger"
import { applyCustomFieldOperation } from "./custom-field-operation"
import type { ExecuteStepProps } from "./flow"

export async function setContactCustomField({
  conversation,
  contactInbox,
  step,
  sentByUserId,
}: ExecuteStepProps<SetCustomFieldStepSchema>) {
  try {
    const outcome = await applyCustomFieldOperation(
      {
        fieldReference: step.inputFieldId,
        operation: step.operation,
        value: step.value,
        timezone: step.timezone,
      },
      {
        workspaceId: conversation.workspaceId,
        contactId: conversation.contactId,
        conversation,
        contactInbox,
        sentByUserId,
        // Lenient parsing accepts flexible user input (unix ts, "23/07/2026",
        // ...), and a blank value stamps "now" in the step's zone.
        valueOptions: {
          temporalInputParsing: TemporalInputParsing.Lenient,
          fillEmptyTemporalWithNow: true,
        },
      },
    )
    if (outcome.status === "rejected") {
      logger.warn(
        {
          workspaceId: conversation.workspaceId,
          contactId: conversation.contactId,
          stepId: step.id,
          inputFieldId: step.inputFieldId,
          reason: outcome.reason,
        },
        "Set custom field step rejected; continuing with the remaining steps",
      )
    }
  } catch (error: unknown) {
    // Steps run one-per-BullMQ-job and the next step is only enqueued after
    // this one returns — a thrown error (e.g. an invalid number value) would
    // kill the job and silently drop every remaining step in the node. Log
    // and swallow so the flow keeps going.
    logger.error(
      {
        err: error,
        workspaceId: conversation.workspaceId,
        contactId: conversation.contactId,
        stepId: step.id,
        inputFieldId: step.inputFieldId,
      },
      "Set custom field step failed; continuing with the remaining steps",
    )
  }
}

export async function clearContactCustomField({
  conversation,
  contactInbox,
  step,
}: ExecuteStepProps<ClearCustomFieldStepSchema>) {
  await contactCustomFieldService.deleteByKey({
    workspaceId: conversation.workspaceId,
    contactId: conversation.contactId,
    keyword: step.inputFieldId,
    contactInboxId: contactInbox.id,
    allowBotFields: true,
  })
}

export async function addContactNotes({
  conversation,
  step,
}: ExecuteStepProps<AddContactNotesStepSchema>) {
  await contactNoteService.create({
    workspaceId: conversation.workspaceId,
    contactId: conversation.contactId,
    text: step.content,
    createdById: null,
  })
}

export async function markEmailVerified({
  conversation,
}: ExecuteStepProps<MarkEmailVerifiedStepSchema>) {
  await contactService.update(
    { workspaceId: conversation.workspaceId, id: conversation.contactId },
    { emailVerified: true },
  )
}

export async function optInEmail({
  conversation,
}: ExecuteStepProps<OptInEmailStepSchema>) {
  await contactService.update(
    { workspaceId: conversation.workspaceId, id: conversation.contactId },
    { emailOptIn: true },
  )
}

export async function optOutEmail({
  conversation,
}: ExecuteStepProps<OptOutEmailStepSchema>) {
  await contactService.update(
    { workspaceId: conversation.workspaceId, id: conversation.contactId },
    { emailOptIn: false },
  )
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
  await tagService.attachByNamesToContacts({
    workspaceId,
    contactIds: [contactId],
    names: tagNames,
    contactInbox,
    emitFor: "newlyLinked",
  })
}

export async function removeContactTag({
  conversation,
  contactInbox,
  step,
}: ExecuteStepProps<AddContactTagStepSchema>) {
  await detachTagsByNames(
    conversation.workspaceId,
    conversation.contactId,
    step.tags,
    contactInbox,
  )
}

export async function detachTagsByNames(
  workspaceId: string,
  contactId: string,
  tagNames: string[],
  contactInbox?: TagAttachContactInbox,
): Promise<void> {
  await tagService.detachByNamesFromContacts({
    workspaceId,
    contactIds: [contactId],
    names: tagNames,
    contactInboxId: contactInbox?.id,
  })
}

export async function deleteContact({
  conversation,
}: ExecuteStepProps<DeleteContactStepSchema>) {
  await contactService.deleteAndRecord({
    workspaceId: conversation.workspaceId,
    ids: [conversation.contactId],
    triggerSource: "worker",
  })
}

export async function addContactSequence({
  conversation,
  contactInbox,
  step,
}: ExecuteStepProps<SubscribeSequenceStepSchema>) {
  if (!step.sequenceId) {
    return
  }

  await contactSequenceService.subscribeFromFlow({
    workspaceId: conversation.workspaceId,
    contactId: conversation.contactId,
    sequenceId: step.sequenceId,
    contactInboxId: contactInbox.id,
  })
}

/**
 * "Change gamification scores" action. A paused/finished/deleted leaderboard
 * blocks bot scoring by design — the step then simply does nothing.
 */
export async function changeGamificationScore({
  conversation,
  step,
  flowExecutionKey,
  triggerMessageCreatedAt,
}: ExecuteStepProps<ChangeGamificationScoreStepSchema>) {
  if (!(step.leaderboardId && (step.targetUser || step.targetReferrer))) {
    return
  }
  const result = await leaderboardScoringService.changeFromFlow({
    workspaceId: conversation.workspaceId,
    leaderboardId: step.leaderboardId,
    contactId: conversation.contactId,
    operation: step.operation,
    points: step.points,
    targets: { user: step.targetUser, referrer: step.targetReferrer },
    // A retried flow job reuses its execution key, so the step never scores
    // twice — whether or not a trigger message pins the event time.
    dedup: flowExecutionKey
      ? {
          key: `${flowExecutionKey}:${step.id}`,
          at: triggerMessageCreatedAt ?? null,
        }
      : null,
  })
  if (result.status !== "applied") {
    logger.info(
      { leaderboardId: step.leaderboardId, status: result.status },
      "changeGamificationScore skipped",
    )
  }
}

export async function removeContactSequence({
  conversation,
  contactInbox,
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
    contactInboxId: contactInbox.id,
  })
}

export async function subscribeBroadcast({
  conversation,
}: ExecuteStepProps<SubscribeBroadcastStepSchema>) {
  await contactService.setBroadcastSubscription({
    workspaceId: conversation.workspaceId,
    id: conversation.contactId,
    subscribed: true,
  })
}

export async function unsubscribeBroadcast({
  conversation,
  contactInbox,
}: ExecuteStepProps<UnsubscribeBroadcastStepSchema>) {
  await contactService.setBroadcastSubscription({
    workspaceId: conversation.workspaceId,
    id: conversation.contactId,
    subscribed: false,
  })

  await emitContactUnsubscribed(
    conversation.workspaceId,
    conversation.contactId,
    contactInbox.id,
  )
}
