"use server"

import { and, db, desc, eq } from "@chatbotx.io/database/client"
import { contactModel } from "@chatbotx.io/database/schema"

// Lista os contatos que foram fundidos em um primary (#17 Unmerge).
// Usado no banner do drawer do contato primary pra mostrar lista
// expansível com botão "Desfazer fusão" por linha.
export async function listContactsMergedInto(
  workspaceId: string,
  primaryId: string,
) {
  const rows = await db
    .select({
      id: contactModel.id,
      firstName: contactModel.firstName,
      lastName: contactModel.lastName,
      fullName: contactModel.fullName,
      email: contactModel.email,
      phoneNumber: contactModel.phoneNumber,
      avatar: contactModel.avatar,
      mergedAt: contactModel.mergedAt,
      mergedByUserId: contactModel.mergedByUserId,
    })
    .from(contactModel)
    .where(
      and(
        eq(contactModel.workspaceId, workspaceId),
        eq(contactModel.mergedIntoId, primaryId),
      ),
    )
    .orderBy(desc(contactModel.mergedAt))
  return rows
}

export type MergedIntoContact = Awaited<
  ReturnType<typeof listContactsMergedInto>
>[number]
