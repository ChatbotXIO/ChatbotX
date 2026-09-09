import { db } from "@chatbotx.io/database/client"

export type MessageEventType =
  | "message:sent"
  | "message:delivered"
  | "message:seen"
  | "message:failed"
  | "flow:clicked"

export abstract class BaseRepository {
  /**
   * Resolve contact inboxes by id with the narrow contact/conversation
   * columns needed to build a contact-event row. Shared here so
   * `LinkStatsRepository` and `FlowStatsRepository` don't keep two
   * byte-identical copies in sync.
   */
  findContactInboxesWithContact(contactInboxIds: string[]) {
    return db.query.contactInboxModel.findMany({
      where: { id: { in: contactInboxIds } },
      with: {
        contact: {
          columns: { id: true, firstName: true, lastName: true, avatar: true },
        },
        conversation: { columns: { id: true } },
      },
      columns: { id: true, sourceId: true, channel: true },
    })
  }

  protected getOccurredAt(
    row: {
      deliveredAt: Date | null
      seenAt: Date | null
      failedAt: Date | null
      clickedAt: Date | null
    },
    eventType: MessageEventType,
  ): string {
    switch (eventType) {
      case "message:sent":
        return (row.deliveredAt ?? row.failedAt ?? new Date()).toISOString()
      case "message:delivered":
        return (row.deliveredAt ?? new Date()).toISOString()
      case "message:seen":
        return (row.seenAt ?? new Date()).toISOString()
      case "message:failed":
        return (row.failedAt ?? new Date()).toISOString()
      case "flow:clicked":
        return (row.clickedAt ?? new Date()).toISOString()
      default:
        return new Date().toISOString()
    }
  }
}
