"use server"

import { db } from "@chatbotx.io/database/client"

// biome-ignore lint/suspicious/useAwait: "use server" requires async functions (Next.js)
export async function getMyWorkspaceMember(
  workspaceId: string,
  userId: string,
) {
  return db.query.workspaceMemberModel.findFirst({
    where: {
      workspaceId,
      userId,
    },
  })
}
