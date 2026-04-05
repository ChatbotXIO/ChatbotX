import { db } from "@chatbotx.io/database/client"
import type { ListSavedReplyResponse } from "../schema/mutation"

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
