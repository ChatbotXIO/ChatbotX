export type MessageEventType =
  | "message:sent"
  | "message:delivered"
  | "message:seen"
  | "message:failed"
  | "flow:clicked"

export abstract class BaseRepository {
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
