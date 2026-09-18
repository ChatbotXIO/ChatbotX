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
 * M2 fix: `decodeCursor` returns `null` for EVERY failure mode (malformed
 * base64, invalid JSON, schema mismatch) — the right behaviour for an
 * OMITTED cursor (first page), but silently treating a corrupted/tampered
 * cursor the caller DID provide as "start from page 1" duplicates rows on
 * the client (`CallsPageClient` appends the page instead of replacing it).
 * Thrown only when `input.cursor` was present but failed to decode — never
 * for a first-page request.
 *
 * LOW fix (Fable review): a `ChatbotXException`, not a bare `Error` — a
 * tampered cursor is an expected client-facing 4xx, so `actionClient`'s
 * `handleServerError` (`@/lib/safe-action`) now warn-logs it and returns the
 * translated-at-the-client `loadMoreError` toast via a real 400 status
 * instead of falling through to the generic 5xx `DEFAULT_SERVER_ERROR_MESSAGE`
 * path.
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
 * P5 item 6 — thin request adapter shared by the RSC page (first page) and
 * `listWhatsappCallsAction` (subsequent "Load more" pages): turns session
 * context + the caller's search params into
 * `whatsappCallHistoryService.list`'s input and shapes the response for the
 * client — no where-builders or scope logic here (that lives in the
 * service/repository), matching the `.query.ts` convention in
 * AGENTS.md invariant #9.
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
    // L4: no cast needed — `CALL_ACTIVITY_CHIPS` is `satisfies readonly
    // WhatsappCallActivityChip[]`, so `input.activity` (inferred through
    // `z.enum(CALL_ACTIVITY_CHIPS)`) already IS `WhatsappCallActivityChip |
    // undefined` structurally.
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
