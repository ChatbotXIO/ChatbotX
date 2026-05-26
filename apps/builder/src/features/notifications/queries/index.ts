"use server"

import { db } from "@chatbotx.io/database/client"

export function getMyWorkspaceMember(workspaceId: string, userId: string) {
  return db.query.workspaceMemberModel.findFirst({
    where: {
      workspaceId,
      userId,
    },
  })
}
