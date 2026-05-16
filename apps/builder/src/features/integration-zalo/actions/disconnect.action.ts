"use server"

import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { inboxStatuses } from "@chatbotx.io/database/partials"
import { inboxModel, integrationZaloModel } from "@chatbotx.io/database/schema"
import {
  isRevokedTokenError,
  type ZaloAuthValue,
} from "@chatbotx.io/integration-zalo"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { integrations } from "@/integration"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { logger } from "@/lib/log"
import { workspaceActionClient } from "@/lib/safe-action"

export const disconnectZaloAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
    } = props
    const integrationZalo = await findOrFail({
      table: integrationZaloModel,
      where: {
        workspaceId,
        id,
      },
      message: "Integration Zalo OA not found",
    })

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
      await tx
        .delete(integrationZaloModel)
        .where(eq(integrationZaloModel.id, integrationZalo.id))
      await tx
        .update(inboxModel)
        .set({ status: inboxStatuses.enum.disconnected })
        .where(eq(inboxModel.id, integrationZalo.inboxId))
    })

    revalidateCacheTags(`workspaces:${workspaceId}#zalos`)
  })
