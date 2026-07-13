"use server"

import { inboxService } from "@chatbotx.io/business"
import { and, db, eq, findOrFail, inArray } from "@chatbotx.io/database/client"
import { channelTypes } from "@chatbotx.io/database/partials"
import {
  coexistSyncRunModel,
  integrationMessengerModel,
  tagChannelModel,
} from "@chatbotx.io/database/schema"
import {
  isRevokedTokenError,
  type MessengerAuthValue,
} from "@chatbotx.io/integration-messenger"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { integrations } from "@/integration"
import { workspaceActionClientAllowExpired } from "@/lib/safe-action"

export const disconnectMessengerAction = workspaceActionClientAllowExpired
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

  const authValue = integrationMessenger.auth as MessengerAuthValue

  try {
    await integrations.messenger.disconnect(authValue)
  } catch (error) {
    if (!isRevokedTokenError(error)) {
      throw error
    }
  }

  await db.transaction(async (tx) => {
    // Preserve sync history (importedCount / lastSyncedAt / etc.) for audit
    // and so reconnect can resume from prior watermark. Only abandon ACTIVE
    // runs so the scheduler stops trying to drive them forward against a
    // now-missing integration.
    await tx
      .update(coexistSyncRunModel)
      .set({
        status: "failed",
        finishedAt: new Date(),
        currentError: "Integration disconnected",
      })
      .where(
        and(
          eq(coexistSyncRunModel.integrationId, integrationMessenger.id),
          inArray(coexistSyncRunModel.status, ["init", "running"]),
        ),
      )

    // Polymorphic FK cleanup — no DB-level cascade for TagChannel.integrationId
    await tx
      .delete(tagChannelModel)
      .where(
        and(
          eq(tagChannelModel.channelType, channelTypes.enum.messenger),
          eq(tagChannelModel.integrationId, integrationMessenger.id),
        ),
      )

    await tx
      .delete(integrationMessengerModel)
      .where(eq(integrationMessengerModel.id, integrationMessenger.id))

    await inboxService.disconnect({ inboxId: integrationMessenger.inboxId, tx })
  })
}
