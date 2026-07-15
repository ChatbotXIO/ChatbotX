import { assertPublicUrl } from "@chatbotx.io/business"
import { db } from "@chatbotx.io/database/client"
import { triggerEventTypes } from "@chatbotx.io/database/partials"
import type { MatchableEventType } from "@chatbotx.io/events"
import { logger } from "../../lib/logger"
import type { MatchableWebhookEventData, WebhookWithConditions } from "../types"

type WebhookPayloadBase = {
  event: string
  contact_id: string
  timestamp: Date
}

type WebhookPayload = Record<string, unknown>

type PayloadBuilder = (
  basePayload: WebhookPayloadBase,
  data: Record<string, unknown>,
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
): Promise<WebhookPayload> {
  const tag = await db.query.tagModel.findFirst({
    where: {
      id: data.tagId as string,
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

function buildNewContactPayload(
  basePayload: WebhookPayloadBase,
  data: Record<string, unknown>,
): WebhookPayload {
  return {
    ...basePayload,
    name: data.name as string,
    phone: data.phone as string,
    email: data.email as string,
    custom_fields: (data.customFields as Record<string, unknown>) || {},
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

export class WebhookExecutor {
  private readonly MAX_RETRIES = 3
  private readonly RETRY_DELAY_MS = 1000

  private isConnectionError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false
    }

    const message = error.message.toLowerCase()
    const connectionErrors = [
      "econnrefused",
      "enotfound",
      "econnreset",
      "enetunreach",
      "ehostunreach",
    ]

    return connectionErrors.some((err) => message.includes(err))
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  private async createPayload(eventData: MatchableWebhookEventData) {
    const basePayload = {
      event: EVENT_NAMES[eventData.eventType],
      contact_id: eventData.contactId,
      timestamp: eventData.timestamp,
    }

    return await PAYLOAD_BUILDERS[eventData.eventType](
      basePayload,
      eventData.eventData,
    )
  }

  private async executeRequest(
    url: string,
    payload: unknown,
  ): Promise<Response> {
    await assertPublicUrl(url, "Webhook URL")

    return fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "AhaChat-Webhook/1.0",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    })
  }

  private async attemptRequest(
    webhook: WebhookWithConditions,
    payload: unknown,
    attempt: number,
  ): Promise<boolean> {
    try {
      const response = await this.executeRequest(webhook.url, payload)

      if (!response.ok) {
        logger.warn(
          {
            webhookId: webhook.id,
            url: webhook.url,
            status: response.status,
            attempt,
          },
          "Webhook endpoint returned non-2xx response",
        )
      }

      return true
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        logger.warn(
          { webhookId: webhook.id, url: webhook.url, attempt },
          "Webhook endpoint timed out",
        )
        return true
      }

      if (!this.isConnectionError(error)) {
        logger.warn(
          {
            err: error,
            webhookId: webhook.id,
            url: webhook.url,
            attempt,
          },
          "Webhook request failed without retry",
        )
        return true
      }

      logger.warn(
        {
          err: error,
          webhookId: webhook.id,
          url: webhook.url,
          attempt,
        },
        "Webhook connection failed",
      )

      return false
    }
  }

  async execute({
    webhook,
    eventData,
  }: {
    webhook: WebhookWithConditions
    eventData: MatchableWebhookEventData
  }): Promise<void> {
    const payload = await this.createPayload(eventData)

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      const shouldStop = await this.attemptRequest(webhook, payload, attempt)

      if (shouldStop) {
        return
      }

      if (attempt < this.MAX_RETRIES) {
        logger.warn(
          {
            webhookId: webhook.id,
            url: webhook.url,
            attempt,
            maxRetries: this.MAX_RETRIES,
          },
          "Retrying webhook after connection failure",
        )
        await this.delay(this.RETRY_DELAY_MS * attempt)
      }
    }

    logger.error(
      { webhookId: webhook.id, url: webhook.url },
      `Webhook failed after ${this.MAX_RETRIES} retries`,
    )
  }
}
