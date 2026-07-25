import {
  contactCustomFieldService,
  contactService,
} from "@chatbotx.io/business"
import { db } from "@chatbotx.io/database/client"
import { triggerEventTypes } from "@chatbotx.io/database/partials"
import type { MatchableEventType } from "@chatbotx.io/events"
import type { MatchableWebhookEventData, WebhookPayload } from "../types"

type WebhookPayloadBase = {
  event: string
  contact_id: string
  timestamp: Date
}

type PayloadBuilder = (
  basePayload: WebhookPayloadBase,
  data: Record<string, unknown>,
  workspaceId: string,
) => Promise<WebhookPayload> | WebhookPayload

const EVENT_NAMES = {
  [triggerEventTypes.enum.tagApplied]: "tag_applied",
  [triggerEventTypes.enum.tagRemoved]: "tag_removed",
  [triggerEventTypes.enum.customFieldValueChanged]: "custom_field_changed",
  [triggerEventTypes.enum.contactInfoUpdated]: "contact_info_updated",
  [triggerEventTypes.enum.conversationTransferredToHuman]:
    "conversation_transferred_to_human",
  [triggerEventTypes.enum.conversationTransferredToBot]:
    "conversation_transferred_to_bot",
  [triggerEventTypes.enum.newContact]: "new_contact",
  [triggerEventTypes.enum.contactUnsubscribedFormBroadcast]:
    "contact_unsubscribed",
  [triggerEventTypes.enum.archived]: "conversation_archived",
  [triggerEventTypes.enum.followUp]: "marked_as_follow_up",
  [triggerEventTypes.enum.conversationAssigned]: "conversation_assigned",
  [triggerEventTypes.enum.conversationUnassigned]: "conversation_unassigned",
  [triggerEventTypes.enum.subscribedToSequence]: "subscribed_to_sequence",
  [triggerEventTypes.enum.unsubscribedFromSequence]:
    "unsubscribed_from_sequence",
  [triggerEventTypes.enum.contactReferredANewContact]:
    "contact_referred_a_new_contact",
  [triggerEventTypes.enum.contactReferredExistingContact]:
    "contact_referred_existing_contact",
  [triggerEventTypes.enum.dateTimeBasedTrigger]: "datetime_based_trigger",
} satisfies Record<MatchableEventType, string>

async function buildTagPayload(
  basePayload: WebhookPayloadBase,
  data: Record<string, unknown>,
  workspaceId: string,
): Promise<WebhookPayload> {
  // Scoped by workspace because the tag id comes from event metadata and tag ids
  // are globally unique: an id-only lookup would resolve another tenant's tag
  // and put its name in this workspace's outbound payload.
  const tag = await db.query.tagModel.findFirst({
    where: {
      id: data.tagId as string,
      workspaceId,
      deletedAt: { isNull: true as const },
    },
    columns: { name: true },
  })

  return {
    ...basePayload,
    tag: tag?.name || "",
  }
}

function buildCustomFieldPayload(
  basePayload: WebhookPayloadBase,
  data: Record<string, unknown>,
): WebhookPayload {
  return {
    ...basePayload,
    custom_field: {
      name: data.customFieldName as string,
      old_value: data.oldValue,
      new_value: data.newValue,
    },
  }
}

function buildSequencePayload(
  basePayload: WebhookPayloadBase,
  data: Record<string, unknown>,
): WebhookPayload {
  return {
    ...basePayload,
    sequence_id: data.sequenceId as string,
    sequence_name: data.sequenceName as string,
  }
}

function buildReferralPayload(
  basePayload: WebhookPayloadBase,
  data: Record<string, unknown>,
): WebhookPayload {
  return {
    ...basePayload,
    ref_name: data.refName as string,
    reflink_id: data.reflinkId as string,
  }
}

async function buildNewContactPayload(
  basePayload: WebhookPayloadBase,
  data: Record<string, unknown>,
  workspaceId: string,
): Promise<WebhookPayload> {
  const contact = await contactService.findById({
    workspaceId,
    id: basePayload.contact_id,
  })
  const customFields = contact
    ? await contactCustomFieldService.listWithDefinitions({
        contactId: contact.id,
      })
    : []

  return {
    ...basePayload,
    name: contact?.fullName || (data.name as string) || null,
    first_name: contact?.firstName || null,
    last_name: contact?.lastName || null,
    phone: contact?.phoneNumber || (data.phone as string) || null,
    email: contact?.email || (data.email as string) || null,
    custom_fields: Object.fromEntries(
      customFields.map((field) => [field.name, field.value]),
    ),
  }
}

const PAYLOAD_BUILDERS = {
  [triggerEventTypes.enum.tagApplied]: buildTagPayload,
  [triggerEventTypes.enum.tagRemoved]: buildTagPayload,
  [triggerEventTypes.enum.customFieldValueChanged]: buildCustomFieldPayload,
  [triggerEventTypes.enum.contactInfoUpdated]: (basePayload, data) => ({
    ...basePayload,
    info_type: data.infoType as string,
    old_value: (data.oldValue as string) || null,
    new_value: data.newValue as string,
  }),
  [triggerEventTypes.enum.conversationTransferredToHuman]: (
    basePayload,
    data,
  ) => ({
    ...basePayload,
    conversation_id: data.conversationId as string,
    transferred_by: (data.transferredBy as string) || "bot",
  }),
  [triggerEventTypes.enum.conversationTransferredToBot]: (
    basePayload,
    data,
  ) => ({
    ...basePayload,
    conversation_id: data.conversationId as string,
    transferred_by: (data.transferredBy as string) || "system",
  }),
  [triggerEventTypes.enum.newContact]: buildNewContactPayload,
  [triggerEventTypes.enum.contactUnsubscribedFormBroadcast]: (basePayload) =>
    basePayload,
  [triggerEventTypes.enum.archived]: (basePayload, data) => ({
    ...basePayload,
    conversation_id: data.conversationId as string,
    archived_by: (data.archivedBy as string) || "system",
  }),
  [triggerEventTypes.enum.followUp]: (basePayload, data) => ({
    ...basePayload,
    conversation_id: data.conversationId as string,
    marked_by: (data.markedBy as string) || "system",
  }),
  [triggerEventTypes.enum.conversationAssigned]: (basePayload, data) => ({
    ...basePayload,
    conversation_id: data.conversationId as string,
    assigned_to: data.assignedTo as string,
    assigned_by: (data.assignedBy as string) || "system",
  }),
  [triggerEventTypes.enum.conversationUnassigned]: (basePayload, data) => ({
    ...basePayload,
    conversation_id: data.conversationId as string,
    unassigned_by: (data.unassignedBy as string) || "system",
  }),
  [triggerEventTypes.enum.subscribedToSequence]: buildSequencePayload,
  [triggerEventTypes.enum.unsubscribedFromSequence]: buildSequencePayload,
  [triggerEventTypes.enum.contactReferredANewContact]: buildReferralPayload,
  [triggerEventTypes.enum.contactReferredExistingContact]: buildReferralPayload,
  [triggerEventTypes.enum.dateTimeBasedTrigger]: (basePayload, data) => ({
    ...basePayload,
    ...data,
  }),
} satisfies Record<MatchableEventType, PayloadBuilder>

/**
 * Builds the request body for one event, independently of how many webhooks it
 * will be sent to. Payload construction lives apart from delivery on purpose:
 * it reads the database (a `new_contact` event resolves the stored contact and
 * its custom fields), so callers build once per event and reuse the result for
 * the whole fan-out instead of repeating those reads per webhook.
 */
export async function buildWebhookPayload(
  eventData: MatchableWebhookEventData,
): Promise<WebhookPayload> {
  const basePayload = {
    event: EVENT_NAMES[eventData.eventType],
    contact_id: eventData.contactId,
    timestamp: eventData.timestamp,
  }

  return await PAYLOAD_BUILDERS[eventData.eventType](
    basePayload,
    eventData.eventData,
    eventData.workspaceId,
  )
}
