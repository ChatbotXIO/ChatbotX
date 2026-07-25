"use server"

import { inboxService, workspaceService } from "@chatbotx.io/business"
import { and, db, eq, findOrFail } from "@chatbotx.io/database/client"
import { channelTypes } from "@chatbotx.io/database/partials"
import {
  integrationZaloModel,
  tagChannelModel,
} from "@chatbotx.io/database/schema"
import {
  isRevokedTokenError,
  type ZaloAuthValue,
} from "@chatbotx.io/integration-zalo"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { integrations } from "@/integration"
import { logger } from "@/lib/log"
import { workspaceActionClientAllowExpired } from "@/lib/safe-action"

export const disconnectZaloAction = workspaceActionClientAllowExpired
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
    } = props
    const [integrationZalo, workspace] = await Promise.all([
      findOrFail({
        table: integrationZaloModel,
        where: {
          workspaceId,
          id,
        },
        message: "Integration Zalo OA not found",
      }),
      workspaceService.findById({ id: workspaceId }),
    ])

    try {
      await integrations.zalo.disconnect(integrationZalo.auth as ZaloAuthValue)
    } catch (error) {
      logger.warn(
        error,
        "Zalo disconnect API call failed — proceeding with local cleanup",
      )

      if (!isRevokedTokenError(error)) {
        throw error
      }
    }

    await db.transaction(async (tx) => {
      // Polymorphic FK cleanup — no DB-level cascade for TagChannel.integrationId
      await tx
        .delete(tagChannelModel)
        .where(
          and(
            eq(tagChannelModel.channelType, channelTypes.enum.zalo),
            eq(tagChannelModel.integrationId, integrationZalo.id),
          ),
        )
      await tx
        .delete(integrationZaloModel)
        .where(eq(integrationZaloModel.id, integrationZalo.id))
      await inboxService.disconnect({
        inboxId: integrationZalo.inboxId,
        ownerId: workspace.ownerId,
        workspaceId,
        tx,
      })
    })
  })
