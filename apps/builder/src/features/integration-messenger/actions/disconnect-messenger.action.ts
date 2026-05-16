"use server"

import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { inboxStatuses } from "@chatbotx.io/database/partials"
import {
  inboxModel,
  integrationMessengerModel,
} from "@chatbotx.io/database/schema"
import {
  isRevokedTokenError,
  type MessengerAuthValue,
} from "@chatbotx.io/integration-messenger"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { integrations } from "@/integration"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"

export const disconnectMessengerAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
    } = props

    await disconnectMessenger({ workspaceId, id })
  })

const disconnectMessenger = async (ctx: {
  workspaceId: string
  id: string
}) => {
  const integrationMessenger = await findOrFail({
    table: integrationMessengerModel,
    where: {
      id: ctx.id,
      workspaceId: ctx.workspaceId,
    },
    message: "Integration Messenger not found",
  })

  await db.transaction(async (tx) => {
    // Unsubscribe from app
    const authValue = integrationMessenger.auth as MessengerAuthValue

    try {
      await integrations.messenger.disconnect(authValue)
    } catch (error) {
      if (!isRevokedTokenError(error)) {
        throw error
      }
    }

    await tx
      .delete(integrationMessengerModel)
      .where(eq(integrationMessengerModel.id, integrationMessenger.id))

    await tx
      .update(inboxModel)
      .set({ status: inboxStatuses.enum.disconnected })
      .where(eq(inboxModel.id, integrationMessenger.inboxId))
  })

  revalidateCacheTags([
    `workspaces:${ctx.workspaceId}#messenger`,
    `workspaces:${ctx.workspaceId}#inboxes`,
  ])
}
