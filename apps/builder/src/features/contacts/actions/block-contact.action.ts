"use server"

import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { contactModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import {
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"

export const blockContactAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
    } = props

    await blockContact({ workspaceId, id })
  })

export const blockContact = async (ctx: {
  workspaceId: string
  id: string
}) => {
  const existingContact = await findOrFail({
    table: contactModel,
    where: {
      workspaceId: ctx.workspaceId,
      id: ctx.id,
    },
    message: "Contact not found",
  })

  const contact = await db
    .update(contactModel)
    .set({
      blockedAt: new Date(),
    })
    .where(eq(contactModel.id, existingContact.id))
    .returning()
    .then((result) => result[0])

  revalidateCacheTags([
    `workspaces:${ctx.workspaceId}#contacts`,
    `workspaces:${ctx.workspaceId}#conversations`,
  ])

  await integrationQueue.add(IntegrationJobAction.blockContact, {
    type: IntegrationJobAction.blockContact,
    data: {
      contact,
    },
  })
}
