"use server"

import { db, findOrFail } from "@chatbotx.io/database/client"
import {
  broadcastModel,
  contactsOnBroadcastsModel,
} from "@chatbotx.io/database/schema"
import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { ChatbotXException } from "@/lib/errors/exception"
import { workspaceActionClient } from "@/lib/safe-action"

export const resendBroadcastAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
    } = props

    return await resendBroadcast({ workspaceId, id })
  })

export const resendBroadcast = async (ctx: {
  workspaceId: string
  id: string
}) => {
  const broadcast = await findOrFail({
    table: broadcastModel,
    where: {
      id: ctx.id,
      workspaceId: ctx.workspaceId,
    },
  })
  if (broadcast.status !== "sent") {
    throw new ChatbotXException("Broadcast is not sent")
  }

  await db.transaction(async (tx) => {
    const newBroadcast = await tx
      .insert(broadcastModel)
      .values({
        workspaceId: ctx.workspaceId,
        flowId: broadcast.flowId,
        channel: broadcast.channel,
        subaction: broadcast.subaction,
        status: "scheduled",
        schedulesType: "now",
        schedulesAt: new Date(),
        contactFilter: broadcast.contactFilter,
        name: `${broadcast.name} (Resend)`,
        id: createId(),
      })
      .returning()
      .then((result) => result[0])

    const linkedContacts = await tx.query.contactsOnBroadcastsModel.findMany({
      columns: {
        contactId: true,
        conversationId: true,
        contactInboxId: true,
      },
      where: {
        broadcastId: broadcast.id,
      },
    })

    await tx.insert(contactsOnBroadcastsModel).values(
      linkedContacts.map((contact) => ({
        broadcastId: newBroadcast.id,
        contactId: contact.contactId,
        conversationId: contact.conversationId,
        contactInboxId: contact.contactInboxId,
      })),
    )

    return newBroadcast
  })

  revalidateCacheTags(`workspaces:${ctx.workspaceId}#broadcasts`)
}
