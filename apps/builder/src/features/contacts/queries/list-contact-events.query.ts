"use server"

import { db } from "@chatbotx.io/database/client"
import type { ContactEventModel } from "@chatbotx.io/database/types"

export async function listContactEvents(props: {
  contactId: string
  workspaceId: string
  limit?: number
}): Promise<ContactEventModel[]> {
  const { contactId, workspaceId, limit = 50 } = props
  return await db.query.contactEventModel.findMany({
    where: { contactId, workspaceId },
    orderBy: { createdAt: "desc" },
    limit,
  })
}
