import { BOT_MESSAGE_EVENTS_EVENT_TYPE } from "../lib/events-config"
import type { CreateBotMessageEvent } from "../schemas"
import { BaseService } from "./base.service"

export class BotMessageTrackingService extends BaseService {
  async trackEvent(
    event: CreateBotMessageEvent,
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
      event_type: "bot_message_received",
      chatbot_id: event.chatbotId,
      message_id: event.messageId,
      conversation_id: event.conversationId,
      occurred_at: Math.floor(event.occurredAt.getTime() / 1000),
      has_response: event.hasResponse ? 1 : 0,
      response_type: event.responseType,
      route_type: event.routeType || "",
      result: event.result || "",
      ai_provider: event.aiProvider,
      channel: event.channel || null,
      source: event.source || null,
      metadata: event.metadata ? JSON.stringify(event.metadata) : null,
      inserted_at: Math.floor(Date.now() / 1000),
    }

    if (!(await this.canWrite(row))) {
      console.log(
        `[BotMessageTrackingService] Event for message ${row.message_id} already tracked this hour, skipping`,
      )
      return
    }

    await this.persistEvent(
      BOT_MESSAGE_EVENTS_EVENT_TYPE,
      row,
      skipSpooler,
      "BotMessageTrackingService",
    )
  }

  async trackEvents(events: CreateBotMessageEvent[]): Promise<void> {
    if (events.length === 0) {
      return
    }

    for (const event of events) {
      await this.trackEvent(event)
    }
  }
}

export const botMessageTrackingService = new BotMessageTrackingService()
