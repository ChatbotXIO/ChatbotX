import { db } from "@aha.chat/database/client"

export type SavedReplyResource = {
  id: string
  shortcut: string
  text: string
}

export async function listSavedReplies(input: {
  userId: string
}): Promise<SavedReplyResource[]> {
  return await db.query.savedReplyModel.findMany({
    where: {
      userId: input.userId,
    },
    columns: {
      id: true,
      shortcut: true,
      text: true,
    },
  })
}
