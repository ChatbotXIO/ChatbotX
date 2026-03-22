import { db } from "@aha.chat/database/client"
import type { ListSavedReplyResponse } from "../schema"

export async function listSavedReplies(input: {
  userId: string
}): Promise<ListSavedReplyResponse> {
  const data = await db.query.savedReplyModel.findMany({
    where: {
      userId: input.userId,
    },
    orderBy: {
      createdAt: "asc",
    },
  })

  return { data }
}
