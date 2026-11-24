import { conversationParticipantService } from "@chatbotx.io/business"
import { zodBigintIdAsString } from "@chatbotx.io/utils"
import z from "zod"
import { decodeCursor, encodeCursor } from "@/lib/pagination"
import {
  invalidCursorException,
  isCursorTimeInRange,
} from "@/lib/pagination/cursor-validation"
import { mapConversationParticipants } from "../lib/map-participants"
import {
  CONVERSATION_PARTICIPANTS_DEFAULT_LIMIT,
  CONVERSATION_PARTICIPANTS_MAX_LIMIT,
} from "../schema/public"
import type { ListConversationParticipantsResponse } from "../schema/resource"

const participantCursorSchema = z.object({
  lastRepliedAt: z.coerce.date().refine(isCursorTimeInRange),
  userId: zodBigintIdAsString(),
})
type ParticipantCursor = z.infer<typeof participantCursorSchema>

type ListConversationParticipantsInput = {
  workspaceId: string
  conversationId: string
  cursor?: string
  perPage?: number | null
}

/**
 * One page of the members who replied in a conversation, newest first.
 * Shared by the public and the private procedure; the caller has already
 * checked the conversation belongs to the workspace.
 */
export const listConversationParticipants = async (
  input: ListConversationParticipantsInput,
): Promise<ListConversationParticipantsResponse> => {
  const { workspaceId, conversationId } = input

  const limit = Math.min(
    input.perPage ?? CONVERSATION_PARTICIPANTS_DEFAULT_LIMIT,
    CONVERSATION_PARTICIPANTS_MAX_LIMIT,
  )
  const cursor = input.cursor
    ? decodeCursor(input.cursor, participantCursorSchema)
    : null
  if (input.cursor && !cursor) {
    throw invalidCursorException()
  }

  const rows = await conversationParticipantService.listReplied({
    workspaceId,
    conversationId,
    cursor: cursor ?? undefined,
    limit: limit + 1,
  })
  const page = rows.slice(0, limit)
  const last = page.at(-1)

  return {
    data: mapConversationParticipants(page),
    nextCursor:
      rows.length > limit && last
        ? encodeCursor({
            lastRepliedAt: last.lastRepliedAt,
            userId: last.userId,
          } satisfies ParticipantCursor)
        : null,
  }
}
