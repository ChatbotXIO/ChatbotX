import { db } from "@chatbotx.io/database/client"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { SavedReplyResource } from "../schema/resource"

/**
 * Versão RSC (Server Component) — busca snippets do workspace pra page de
 * Settings. Não paginada (Respond.io limita 5000 por workspace, valor que
 * ainda cabe em memória). Quando passar de ~1000 snippets reais, adicionar
 * pagination + search server-side.
 */
export async function listSnippetsRSC(input: {
  workspaceId: string
}): Promise<{ data: SavedReplyResource[]; pageCount: number }> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  const data = await db.query.savedReplyModel.findMany({
    where: { workspaceId: input.workspaceId },
    orderBy: { createdAt: "desc" },
  })

  return { data: data as SavedReplyResource[], pageCount: 1 }
}
