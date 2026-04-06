import { CONTACT_EVENTS_EVENT_TYPE } from "../lib/events-config"
import { logger } from "../lib/logger"
import type { CreateContactEvent } from "../schemas"
import { BaseService } from "./base.service"

export class ContactTrackingService extends BaseService {
  async trackEvent(
    event: CreateContactEvent,
    options?: { skipSpooler?: boolean },
  ): Promise<void> {
    try {
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
        workspace_id: event.workspaceId,
        contact_id: event.contactId,
        event_type: event.eventType,
        sender_type: event.senderType || "",
        admin_id: event.adminId || "",
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

      await this.persistEvent(
        CONTACT_EVENTS_EVENT_TYPE,
        row,
        skipSpooler,
        "ContactTrackingService",
      )
    } catch (error) {
      logger.error(error, "Failed to track contact event")
      return
    }
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
