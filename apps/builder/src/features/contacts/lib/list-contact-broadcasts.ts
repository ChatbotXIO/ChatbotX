import {
  type ContactAccessScope,
  type ContactBroadcastRow,
  listContactBroadcasts,
} from "@chatbotx.io/business"
import {
  broadcastStatuses,
  isPositiveBigint,
} from "@chatbotx.io/database/partials"
import { decodeCursor, encodeCursor } from "@/lib/pagination/cursor-pagination"
import {
  invalidCursorException,
  isCursorTimeInRange,
} from "@/lib/pagination/cursor-validation"
import type {
  ContactBroadcastRecipientStatus,
  ContactBroadcastResource,
  ListContactBroadcastsResponse,
} from "../schema/contact-broadcast"

const isUsableCursor = (cursor: { createdAt: Date; id: string }): boolean =>
  isPositiveBigint(cursor.id) && isCursorTimeInRange(cursor.createdAt)

/** The furthest outcome wins: a clicked message was also seen and delivered. */
const recipientStatusOf = (
  row: ContactBroadcastRow,
): ContactBroadcastRecipientStatus => {
  if (row.failedAt) {
    return "failed"
  }
  if (row.clickedAt) {
    return "clicked"
  }
  if (row.seenAt) {
    return "seen"
  }
  if (row.deliveredAt) {
    return "delivered"
  }
  return "sent"
}

const toResource = (row: ContactBroadcastRow): ContactBroadcastResource => ({
  broadcastId: row.broadcastId,
  name: row.name,
  broadcastStatus: broadcastStatuses.parse(row.status),
  channel: row.channel,
  scheduledAt: row.schedulesAt,
  recipientStatus: recipientStatusOf(row),
  deliveredAt: row.deliveredAt,
  seenAt: row.seenAt,
  clickedAt: row.clickedAt,
  failedAt: row.failedAt,
})

/** One implementation for the token API and the inbox UI. */
export async function listContactBroadcastsPage(input: {
  workspaceId: string
  contactId: string
  perPage: number
  cursor?: string
  search?: string
  accessScope?: ContactAccessScope
}): Promise<ListContactBroadcastsResponse> {
  const cursor = decodeCursor(input.cursor)
  // A corrupt cursor must not restart at page 1 (a client appending pages would
  // repeat rows). The codec only checks that the id is digits and the time is a
  // date: an id past the bigint range, or a time outside years 1-9999 (see
  // `isUsableCursor`), would reach the SQL compare and fail there as a 500.
  if (input.cursor && !(cursor && isUsableCursor(cursor))) {
    throw invalidCursorException()
  }
  const { data, nextCursor } = await listContactBroadcasts({
    workspaceId: input.workspaceId,
    contactId: input.contactId,
    limit: input.perPage,
    search: input.search,
    cursor: cursor
      ? { schedulesAt: cursor.createdAt, broadcastId: cursor.id }
      : undefined,
    accessScope: input.accessScope,
  })

  // The shared cursor codec has no `schedulesAt` slot: it rides in `createdAt`.
  return {
    data: data.map(toResource),
    nextCursor: nextCursor
      ? encodeCursor({
          direction: "next",
          createdAt: nextCursor.schedulesAt,
          id: nextCursor.broadcastId,
        })
      : null,
  }
}
