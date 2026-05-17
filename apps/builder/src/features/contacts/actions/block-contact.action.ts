"use server"

import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { contactModel } from "@chatbotx.io/database/schema"
import { emit } from "@chatbotx.io/event-bus"
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

  emit("analytics:dashboard", {
    eventType: "contact:blocked",
    workspaceId: ctx.workspaceId,
    contactId: contact.id,
    occurredAt: contact.blockedAt ?? new Date(),
    country: contact.country,
    metadata: {
      triggerContext: {
        triggerSource: "api",
        triggerHandler: "blockContactAction",
        triggerType: "contact_blocked",
        origin: "manual",
      },
    },
  }).catch((error) => {
    console.error(
      "[blockContactAction] Failed to emit contact:blocked event",
      error,
    )
  })

  await integrationQueue.add(IntegrationJobAction.blockContact, {
    type: IntegrationJobAction.blockContact,
    data: {
      contact,
    },
  })
}
