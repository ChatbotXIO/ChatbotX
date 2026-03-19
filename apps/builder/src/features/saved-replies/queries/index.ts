import { db } from "@aha.chat/database/client"
import type { ListSavedReplyResponse } from "../schemas/query"

export type SavedReplyResource = {
  id: string
  shortcut: string
  text: string
}

export async function listSavedReplies(input: {
  userId: string
}): Promise<ListSavedReplyResponse> {
  return await db.query.savedReplyModel.findMany({
    where: {
      userId: input.userId,
    },
  })
}
