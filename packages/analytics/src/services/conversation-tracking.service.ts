import { CONVERSATION_EVENTS_EVENT_TYPE } from "../lib/events-config"
import { getSpooler } from "../lib/ndjson-spooler-registry"
import type { CreateConversationEvent } from "../models"
import { BaseService } from "./base.service"
import { getDefaultEventWriter } from "./event-writer-factory"

export class ConversationTrackingService extends BaseService {
  async trackEvent(event: CreateConversationEvent): Promise<void> {
    if (
      !(event.occurredAt instanceof Date) ||
      Number.isNaN(event.occurredAt.getTime())
    ) {
      throw new Error("Invalid occurredAt")
    }

    const row = {
      event_id: this.getEventId(event),
      chatbot_id: event.chatbotId,
      conversation_id: event.conversationId,
      event_type: event.eventType,
      occurred_at: Math.floor(event.occurredAt.getTime() / 1000),
      from_assignee: event.fromAssignee || "",
      to_assignee: event.toAssignee || "",
      channel: event.channel || "",
      metadata: event.metadata ? JSON.stringify(event.metadata) : "",
      inserted_at: Math.floor(Date.now() / 1000),
    }

    if (!(await this.canWrite(row))) {
      console.log(
        `[ConversationTrackingService] Event ${row.event_type} for conversation ${row.conversation_id} already tracked this hour, skipping`,
      )
      return
    }

    const sp = getSpooler(CONVERSATION_EVENTS_EVENT_TYPE)
    if (!sp) {
      throw new Error("Spooler not initialized")
    }

    await this.tryOrFallback(
      async () => {
        await sp.writeEvent(row)
      },
      async () => {
        const writer = getDefaultEventWriter()
        await writer.insertOne(CONVERSATION_EVENTS_EVENT_TYPE, row)
      },
      "[ConversationTrackingService] Spool write failed, fallback to direct insert",
      "[ConversationTrackingService] Direct insert failed",
    )
  }
}

export const conversationTrackingService = new ConversationTrackingService()
