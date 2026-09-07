import {
  contactCustomFieldService,
  contactNoteService,
  contactService,
  tagService,
} from "@chatbotx.io/business"
import { contactSequenceService } from "@chatbotx.io/business/contact-sequence"
import { emitContactUnsubscribed } from "@chatbotx.io/events"
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
import { TemporalInputParsing } from "@chatbotx.io/utils/datetime"
import { contactVariableService } from "@chatbotx.io/variables"
import { logger } from "../../lib/logger"
import type { ExecuteStepProps } from "./flow"

export async function setContactCustomField({
  conversation,
  contactInbox,
  step,
}: ExecuteStepProps<SetCustomFieldStepSchema>) {
  try {
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
      contactInboxId: contactInbox.id,
      allowBotFields: true,
      operation: step.operation,
    })
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

  await contactSequenceService.enrollFromFlow({
    workspaceId: conversation.workspaceId,
    contactId: conversation.contactId,
    sequenceId: step.sequenceId,
    contactInboxId: contactInbox.id,
  })
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
