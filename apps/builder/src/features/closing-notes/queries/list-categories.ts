"use server"

import { asc, db, eq } from "@chatbotx.io/database/client"
import { conversationCategoryModel } from "@chatbotx.io/database/schema"

export async function listConversationCategories(workspaceId: string) {
  const rows = await db
    .select()
    .from(conversationCategoryModel)
    .where(eq(conversationCategoryModel.workspaceId, workspaceId))
    .orderBy(
      asc(conversationCategoryModel.position),
      asc(conversationCategoryModel.name),
    )
  return rows
}

export type ConversationCategory = Awaited<
  ReturnType<typeof listConversationCategories>
>[number]
