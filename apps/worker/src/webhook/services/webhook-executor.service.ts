import { db } from "@chatbotx.io/database/client"
import { triggerEventTypes } from "@chatbotx.io/database/partials"
import { logger } from "../../lib/logger"
import type { WebhookEventData, WebhookWithConditions } from "../types"

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

  private getEventName(eventType: string): string {
    const eventMap: Record<string, string> = {
      [triggerEventTypes.enum.tagApplied]: "tag_applied",
      [triggerEventTypes.enum.tagRemoved]: "tag_removed",
      [triggerEventTypes.enum.customFieldValueChanged]: "custom_field_changed",
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
      [triggerEventTypes.enum.conversationUnassigned]:
        "conversation_unassigned",
      [triggerEventTypes.enum.subscribedToSequence]: "subscribed_to_sequence",
      [triggerEventTypes.enum.unsubscribedFromSequence]:
        "unsubscribed_from_sequence",
    }
    return eventMap[eventType] || `event_${eventType}`
  }

  private async createPayload(eventData: WebhookEventData) {
    const basePayload = {
      event: this.getEventName(eventData.eventType),
      contact_id: eventData.contactId,
      timestamp: eventData.timestamp,
    }

    // eventData.eventData is already the metadata object from webhook emitter
    const data = eventData.eventData as Record<string, unknown>

    // Tag events
    if (
      eventData.eventType === triggerEventTypes.enum.tagApplied ||
      eventData.eventType === triggerEventTypes.enum.tagRemoved
    ) {
      const tag = await db.query.tagModel.findFirst({
        where: { id: data.tagId as string },
        columns: { name: true },
      })

      return {
        ...basePayload,
        tag: tag?.name || "",
      }
    }

    // Custom field events
    if (
      eventData.eventType === triggerEventTypes.enum.customFieldValueChanged
    ) {
      return {
        ...basePayload,
        custom_field: {
          name: data.customFieldName as string,
          old_value: data.oldValue,
          new_value: data.newValue,
        },
      }
    }

    // Sequence events
    if (
      eventData.eventType === triggerEventTypes.enum.subscribedToSequence ||
      eventData.eventType === triggerEventTypes.enum.unsubscribedFromSequence
    ) {
      return {
        ...basePayload,
        sequence_id: data.sequenceId as string,
        sequence_name: data.sequenceName as string,
      }
    }

    // Conversation transferred to human
    if (
      eventData.eventType ===
      triggerEventTypes.enum.conversationTransferredToHuman
    ) {
      return {
        ...basePayload,
        conversation_id: data.conversationId as string,
        transferred_by: (data.transferredBy as string) || "bot",
      }
    }

    // Conversation transferred to bot
    if (
      eventData.eventType ===
      triggerEventTypes.enum.conversationTransferredToBot
    ) {
      return {
        ...basePayload,
        conversation_id: data.conversationId as string,
        transferred_by: (data.transferredBy as string) || "system",
      }
    }

    // Conversation archived
    if (eventData.eventType === triggerEventTypes.enum.archived) {
      return {
        ...basePayload,
        conversation_id: data.conversationId as string,
        archived_by: (data.archivedBy as string) || "system",
      }
    }

    // Conversation follow up
    if (eventData.eventType === triggerEventTypes.enum.followUp) {
      return {
        ...basePayload,
        conversation_id: data.conversationId as string,
        marked_by: (data.markedBy as string) || "system",
      }
    }

    // Conversation assigned
    if (eventData.eventType === triggerEventTypes.enum.conversationAssigned) {
      return {
        ...basePayload,
        conversation_id: data.conversationId as string,
        assigned_to: data.assignedTo as string,
        assigned_by: (data.assignedBy as string) || "system",
      }
    }

    // Conversation unassigned
    if (eventData.eventType === triggerEventTypes.enum.conversationUnassigned) {
      return {
        ...basePayload,
        conversation_id: data.conversationId as string,
        unassigned_by: (data.unassignedBy as string) || "system",
      }
    }

    // New contact
    if (eventData.eventType === triggerEventTypes.enum.newContact) {
      return {
        ...basePayload,
        name: data.name as string,
        phone: data.phone as string,
        email: data.email as string,
        custom_fields: (data.customFields as Record<string, unknown>) || {},
      }
    }

    // Contact unsubscribed from broadcast
    if (
      eventData.eventType ===
      triggerEventTypes.enum.contactUnsubscribedFormBroadcast
    ) {
      return basePayload
    }

    // Default payload for other events
    return {
      ...basePayload,
      ...eventData.eventData,
    }
  }

  private executeRequest(url: string, payload: unknown): Promise<Response> {
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
    _attempt: number,
  ): Promise<boolean> {
    try {
      const _response = await this.executeRequest(webhook.url, payload)

      // logger.info(`Webhook ${webhook.id} executed successfully`, {
      //   webhookId: webhook.id,
      //   url: webhook.url,
      //   status: _response.status,
      //   _attempt,
      // })

      return true
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        // logger.warn(`Webhook ${webhook.id} timeout, not retrying`, {
        //   webhookId: webhook.id,
        //   url: webhook.url,
        // })
        return true
      }

      if (!this.isConnectionError(error)) {
        // logger.error(
        //   `Webhook ${webhook.id} failed with non-connection error, not retrying`,
        //   {
        //     webhookId: webhook.id,
        //     url: webhook.url,
        //     error: error instanceof Error ? error.message : "Unknown error",
        //   },
        // )
        return true
      }

      return false
    }
  }

  async execute({
    webhook,
    eventData,
  }: {
    webhook: WebhookWithConditions
    eventData: WebhookEventData
  }): Promise<void> {
    const payload = await this.createPayload(eventData)

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      const shouldStop = await this.attemptRequest(webhook, payload, attempt)

      if (shouldStop) {
        return
      }

      if (attempt < this.MAX_RETRIES) {
        // logger.warn(
        //   `Webhook ${webhook.id} connection failed, retrying (${attempt}/${this.MAX_RETRIES})`,
        //   {
        //     webhookId: webhook.id,
        //     url: webhook.url,
        //     error: "Connection error",
        //   },
        // )
        await this.delay(this.RETRY_DELAY_MS * attempt)
      }
    }

    logger.error(
      `Webhook ${webhook.id} failed after ${this.MAX_RETRIES} retries - url: ${webhook.url}`,
    )
  }
}
