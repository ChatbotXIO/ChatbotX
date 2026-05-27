import {
  and,
  count,
  db,
  eq,
  isNotNull,
  isNull,
} from "@chatbotx.io/database/client"
import { contactModel } from "@chatbotx.io/database/schema"

// Pixel-perfect Respond.io 2026-05-25 — count de contatos bloqueados
// pro item "Contatos bloqueados" no rodapé do InboxAreaSidebar (mostra
// o número de contatos com `blockedAt IS NOT NULL`). Pedro pediu — print
// do Respond.io mostra item no fim do sidebar com ícone de cadeado.
export async function countBlockedContacts(
  workspaceId: string,
): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(contactModel)
    .where(
      and(
        eq(contactModel.workspaceId, workspaceId),
        isNotNull(contactModel.blockedAt),
        // #17 Unmerge: exclui duplicates fundidos do count do sidebar.
        isNull(contactModel.mergedIntoId),
      ),
    )
  return row?.count ?? 0
}
