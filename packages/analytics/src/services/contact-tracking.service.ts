import { CONTACT_EVENTS_EVENT_TYPE } from "../lib/events-config"
import { getSpooler } from "../lib/ndjson-spooler-registry"
import type { CreateContactEvent } from "../models"
import { BaseService } from "./base.service"
import { getDefaultEventWriter } from "./event-writer-factory"

export class ContactTrackingService extends BaseService {
  async trackEvent(event: CreateContactEvent): Promise<void> {
    if (
      !(event.occurredAt instanceof Date) ||
      Number.isNaN(event.occurredAt.getTime())
    ) {
      throw new Error("Invalid occurredAt")
    }

    const row = {
      event_id: this.getEventId(event),
      chatbot_id: event.chatbotId,
      contact_id: event.contactId,
      event_type: event.eventType,
      sender_type: event.senderType || "",
      occurred_at: Math.floor(event.occurredAt.getTime() / 1000),
      source: event.source || null,
      source_id: event.sourceId || null,
      channel: event.channel || null,
      country: event.country || null,
      metadata: event.metadata ? JSON.stringify(event.metadata) : null,
      inserted_at: Math.floor(Date.now() / 1000),
    }

    if (!(await this.canWrite(row))) {
      console.log(
        `[ContactTrackingService] Event ${row.event_type} for contact ${row.contact_id} already tracked this hour, skipping`,
      )
      return
    }

    const sp = getSpooler(CONTACT_EVENTS_EVENT_TYPE)
    if (!sp) {
      throw new Error("Spooler not initialized")
    }

    await this.tryOrFallback(
      async () => {
        await sp.writeEvent(row)
      },
      async () => {
        const writer = getDefaultEventWriter()
        await writer.insertOne(CONTACT_EVENTS_EVENT_TYPE, row)
      },
      "[ContactTrackingService] Spool write failed, fallback to direct insert",
      "[ContactTrackingService] Direct insert failed",
    )
  }

  async trackEvents(events: CreateContactEvent[]): Promise<void> {
    if (events.length === 0) {
      return
    }

    for (const event of events) {
      await this.trackEvent(event)
    }
  }
}

export const contactTrackingService = new ContactTrackingService()
