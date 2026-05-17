"use server"

import { ChatbotXException } from "@chatbotx.io/business/errors"
import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { integrationZaloModel } from "@chatbotx.io/database/schema"
import {
  integration as integrationZalo,
  type ZaloAuthValue,
} from "@chatbotx.io/integration-zalo"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { logger } from "@/lib/log"
import { workspaceActionClient } from "@/lib/safe-action"

export const refreshZaloPermissionsAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
    } = props

    await refreshZaloPermissions({ workspaceId, id })
  })

const refreshZaloPermissions = async (ctx: {
  workspaceId: string
  id: string
}) => {
  const integrationZaloRow = await findOrFail({
    table: integrationZaloModel,
    where: { id: ctx.id, workspaceId: ctx.workspaceId },
    message: "Integration Zalo not found",
  })

  const auth = integrationZaloRow.auth as ZaloAuthValue

  try {
    if (!integrationZalo.refreshAuth) {
      throw new ChatbotXException("Zalo integration does not support refresh")
    }
    const updatedAuth = await integrationZalo.refreshAuth({ auth })

    await db
      .update(integrationZaloModel)
      .set({ auth: updatedAuth })
      .where(eq(integrationZaloModel.id, ctx.id))
  } catch (error) {
    logger.error(error, "Failed to refresh Zalo permissions")
    throw new ChatbotXException("Failed to refresh Zalo permissions")
  }
}
