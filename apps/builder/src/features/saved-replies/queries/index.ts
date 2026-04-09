import { db } from "@chatbotx.io/database/client"
import type { ListSavedReplyResponse } from "../schema/mutation"

export async function listSavedReplies(input: {
  workspaceId: string
}): Promise<ListSavedReplyResponse> {
  const data = await db.query.savedReplyModel.findMany({
    where: {
      workspaceId: input.workspaceId,
    },
    orderBy: {
      createdAt: "asc",
    },
  })

  return { data }
}
