import { createId } from "@paralleldrive/cuid2"
import { CONTACT_EVENTS_EVENT_TYPE } from "../lib/events-config"
import type { ContactEvent, CreateContactEvent } from "../models"
import { BaseRepository } from "./base.repository"

export class ContactEventRepository extends BaseRepository {
  private readonly tableName = CONTACT_EVENTS_EVENT_TYPE

  async insertEventWithId(event: ContactEvent): Promise<void> {
    await this.insert(this.tableName, [this.mapRow(event)])
  }

  async insertEvent(event: CreateContactEvent): Promise<void> {
    const eventWithId: ContactEvent = {
      eventId: createId(),
      ...event,
    }

    await this.insertEventWithId(eventWithId)
  }

  async insertBatchWithId(events: ContactEvent[]): Promise<void> {
    if (events.length === 0) {
      return
    }

    const rows = events.map((event) => this.mapRow(event))
    await this.insert(this.tableName, rows)
  }

  async insertBatch(events: CreateContactEvent[]): Promise<void> {
    if (events.length === 0) {
      return
    }

    const eventsWithId = events.map((event) => ({
      eventId: createId(),
      ...event,
    }))

    await this.insertBatchWithId(eventsWithId)
  }

  private mapRow(event: ContactEvent): Record<string, unknown> {
    return {
      event_id: event.eventId,
      chatbot_id: event.chatbotId,
      contact_id: event.contactId,
      event_type: event.eventType,
      occurred_at: Math.floor(event.occurredAt.getTime() / 1000),
      source: event.source || "",
      source_id: event.sourceId || "",
      channel: event.channel || "",
      country: event.country || "",
      metadata: JSON.stringify(event.metadata || {}),
    }
  }
}

export const contactEventRepository = new ContactEventRepository()
