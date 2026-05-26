"use server"

import {
  auditLogActions,
  contactEventTypes,
  logAudit,
  recordContactEvent,
} from "@chatbotx.io/business"
import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { contactModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import {
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"

export const unblockContactAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      ctx: { user },
    } = props

    const contact = await unblockContact({ workspaceId, id })
    const label =
      [contact.firstName, contact.lastName].filter(Boolean).join(" ") ||
      contact.phoneNumber ||
      contact.email ||
      contact.id
    await Promise.all([
      logAudit({
        workspaceId,
        userId: user.id,
        action: auditLogActions.CONTACT_UNBLOCKED,
        detail: `Contato "${label}" desbloqueado`,
      }),
      recordContactEvent({
        contactId: contact.id,
        workspaceId,
        eventType: contactEventTypes.UNBLOCKED,
        meta: { label },
        actorUserId: user.id,
      }),
    ])
  })

export const unblockContact = async (ctx: {
  workspaceId: string
  id: string
}) => {
  const existingContact = await findOrFail({
    table: contactModel,
    where: {
      workspaceId: ctx.workspaceId,
      id: ctx.id,
    },
    message: "Contato não encontrado",
  })

  const contact = await db
    .update(contactModel)
    .set({
      blockedAt: null,
    })
    .where(eq(contactModel.id, existingContact.id))
    .returning()
    .then((result) => result[0])

  revalidateCacheTags([
    `workspaces:${ctx.workspaceId}#contacts`,
    `workspaces:${ctx.workspaceId}#conversations`,
  ])

  await integrationQueue.add(IntegrationJobAction.unblockContact, {
    type: IntegrationJobAction.unblockContact,
    data: {
      contact,
    },
  })

  return contact
}
