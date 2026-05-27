"use server"

import { asc, db, eq } from "@chatbotx.io/database/client"
import type { ClosingNotesMode } from "@chatbotx.io/database/partials"
import { conversationCategoryModel } from "@chatbotx.io/database/schema"

// Server-side helper usado em /inbox/page.tsx pra propagar { mode, categories }
// até o CloseConversationButton via prop drilling. Mantém Zustand fora — config
// muda raramente e é lida no Server Component a cada navegação.
export async function getClosingNotesConfig(workspaceId: string) {
  const [workspace, categories] = await Promise.all([
    db.query.workspaceModel.findFirst({
      where: { id: workspaceId },
      columns: { closingNotesMode: true },
    }),
    db
      .select({
        id: conversationCategoryModel.id,
        name: conversationCategoryModel.name,
        description: conversationCategoryModel.description,
      })
      .from(conversationCategoryModel)
      .where(eq(conversationCategoryModel.workspaceId, workspaceId))
      .orderBy(
        asc(conversationCategoryModel.position),
        asc(conversationCategoryModel.name),
      ),
  ])

  const mode: ClosingNotesMode =
    (workspace?.closingNotesMode as ClosingNotesMode | undefined) ?? "disabled"

  return {
    mode,
    categories,
  }
}

export type ClosingNotesConfig = Awaited<
  ReturnType<typeof getClosingNotesConfig>
>
export type ClosingNoteCategoryOption = ClosingNotesConfig["categories"][number]
