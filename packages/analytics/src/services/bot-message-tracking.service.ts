import { BOT_MESSAGE_EVENTS_EVENT_TYPE } from "../lib/events-config"
import { getSpooler } from "../lib/ndjson-spooler-registry"
import type { CreateBotMessageEvent } from "../models"
import { BaseService } from "./base.service"
import { getDefaultEventWriter } from "./event-writer-factory"

export class BotMessageTrackingService extends BaseService {
  async trackEvent(event: CreateBotMessageEvent): Promise<void> {
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

    const sp = getSpooler(BOT_MESSAGE_EVENTS_EVENT_TYPE)
    if (!sp) {
      throw new Error("Spooler not initialized")
    }

    await this.tryOrFallback(
      async () => {
        await sp.writeEvent(row)
      },
      async () => {
        const writer = getDefaultEventWriter()
        await writer.insertOne(BOT_MESSAGE_EVENTS_EVENT_TYPE, row)
      },
      "[BotMessageTrackingService] Spool write failed, fallback to direct insert",
      "[BotMessageTrackingService] Direct insert failed",
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
