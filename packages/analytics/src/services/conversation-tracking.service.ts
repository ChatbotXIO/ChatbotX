import { CONVERSATION_EVENTS_EVENT_TYPE } from "../lib/events-config"
import type { CreateConversationEvent } from "../schemas"
import { BaseService } from "./base.service"

export class ConversationTrackingService extends BaseService {
  async trackEvent(
    event: CreateConversationEvent,
    options?: { skipSpooler?: boolean },
  ): Promise<void> {
    const skipSpooler = options?.skipSpooler ?? false
    if (!skipSpooler) {
      await this.ensureBootstrapped()
    }

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

    await this.persistEvent(
      CONVERSATION_EVENTS_EVENT_TYPE,
      row,
      skipSpooler,
      "ConversationTrackingService",
    )
  }
}

export const conversationTrackingService = new ConversationTrackingService()
