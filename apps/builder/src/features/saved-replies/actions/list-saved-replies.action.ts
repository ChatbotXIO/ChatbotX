"use server"

import { authActionClient } from "@/lib/safe-action"
import { listSavedReplies } from "../queries"

export const listSavedRepliesAction = authActionClient.action(
  async ({ ctx }: { ctx: { user: { id: string } } }) => {
    return await listSavedReplies({ userId: ctx.user.id })
  },
)
