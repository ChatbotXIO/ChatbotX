import { contactExportService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { decodeCursor, encodeCursor } from "@/lib/pagination"
import {
  contactExportFileCursor,
  type ListContactExportFilesResponse,
} from "../schema/export-file"

/**
 * One implementation for the token API and the export history dialog.
 * `userId` limits the list to that member's own exports; leave it out to list
 * every export of the workspace (an admin, or an API token).
 */
export async function listContactExportFiles(input: {
  workspaceId: string
  userId?: string
  perPage: number
  cursor?: string
}): Promise<ListContactExportFilesResponse> {
  const cursor = input.cursor
    ? decodeCursor(input.cursor, contactExportFileCursor)
    : undefined
  // A corrupt cursor must not restart at page 1 (a client appending pages would repeat rows).
  if (cursor === null) {
    throw new ChatbotXException(
      "The cursor is invalid. Start again without a cursor.",
      "invalidCursor",
      400,
    )
  }
  const { data, nextCursor } = await contactExportService.listFiles({
    workspaceId: input.workspaceId,
    userId: input.userId,
    limit: input.perPage,
    cursor,
  })

  return { data, nextCursor: nextCursor ? encodeCursor(nextCursor) : null }
}
