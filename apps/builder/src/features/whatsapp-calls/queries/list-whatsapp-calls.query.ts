import { whatsappCallHistoryService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import type { PermissionsInput } from "@/lib/auth/permission-routes"
import { decodeCursor, encodeCursor } from "@/lib/pagination"
import {
  type ListWhatsappCallsRequest,
  whatsappCallListCursorSchema,
} from "../schema/query"
import type { ListWhatsappCallsResponse } from "../schema/resource"

const INVALID_CURSOR_HTTP_STATUS = 400

/**
 * `decodeCursor` returns null both for an omitted and a corrupted cursor; silently
 * treating a tampered cursor as "start from page 1" would duplicate rows on the
 * client (which appends rather than replaces), so this throws only when
 * `input.cursor` was present but failed to decode.
 */
export class InvalidWhatsappCallCursorError extends ChatbotXException {
  constructor() {
    super(
      "Whatsapp calls: cursor failed to decode",
      "invalidCursor",
      INVALID_CURSOR_HTTP_STATUS,
    )
    this.name = "InvalidWhatsappCallCursorError"
  }
}

/**
 * Thin request adapter shared by the RSC page (first page) and
 * listWhatsappCallsAction (Load more): turns session context + search params
 * into whatsappCallHistoryService.list's input and shapes the response for
 * the client.
 */
export async function listWhatsappCalls(
  input: ListWhatsappCallsRequest,
  member: { userId: string; permissions: PermissionsInput },
): Promise<ListWhatsappCallsResponse> {
  const cursor = input.cursor
    ? decodeCursor(input.cursor, whatsappCallListCursorSchema)
    : null
  if (input.cursor && !cursor) {
    throw new InvalidWhatsappCallCursorError()
  }

  const result = await whatsappCallHistoryService.list({
    workspaceId: input.workspaceId,
    member,
    activity: input.activity,
    inboxId: input.inboxId,
    agentUserId: input.agentUserId,
    cursor: cursor ?? undefined,
  })

  return {
    data: result.data.map((row) => ({
      id: row.id,
      createdAt: row.createdAt,
      direction: row.direction,
      status: row.status,
      outcome: row.outcome,
      kind: row.kind,
      durationSeconds: row.durationSeconds,
      recordingPath: row.recordingPath,
      conversationId: row.conversationId,
      contact: row.contact,
      inbox: row.inbox,
      answeredByUser: row.answeredByUser
        ? { id: row.answeredByUser.id, name: row.answeredByUser.name }
        : null,
      initiatedByUser: row.initiatedByUser
        ? { id: row.initiatedByUser.id, name: row.initiatedByUser.name }
        : null,
    })),
    nextCursor: result.nextCursor ? encodeCursor(result.nextCursor) : null,
  }
}
