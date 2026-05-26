import { db } from "@chatbotx.io/database/client"

/**
 * Retorna o NOME da etapa de ciclo de vida do contato (não a key).
 * Usado pela variável dinâmica {{lifecycle_stage}}.
 */
export const getLifecycleStageName = async (
  contactId: string,
): Promise<string | null> => {
  const contact = await db.query.contactModel.findFirst({
    where: { id: contactId },
    with: {
      lifecycleStage: true,
    },
  })
  return contact?.lifecycleStage?.name ?? null
}
