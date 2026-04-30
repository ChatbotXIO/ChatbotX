"use server"

import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { integrationMessengerModel } from "@chatbotx.io/database/schema"
import type { MessengerAuthValue } from "@chatbotx.io/integration-messenger"
import { exchangeLongLivedToken } from "@chatbotx.io/integration-messenger/apis/page"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { ChatbotXException } from "@/lib/errors/exception"
import { logger } from "@/lib/log"
import { workspaceActionClient } from "@/lib/safe-action"

export const refreshMessengerPermissionsAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
    } = props

    await refreshMessengerPermissions({ workspaceId, id })
  })

const refreshMessengerPermissions = async (ctx: {
  workspaceId: string
  id: string
}) => {
  const integrationMessenger = await findOrFail({
    table: integrationMessengerModel,
    where: { id: ctx.id, workspaceId: ctx.workspaceId },
    message: "Integration Messenger not found",
  })

  const auth = integrationMessenger.auth as MessengerAuthValue

  try {
    const newAccessToken = await exchangeLongLivedToken(
      {
        clientId: auth.clientId,
        clientSecret: auth.clientSecret,
        version: auth.metadata.version,
      },
      auth.tokens.accessToken,
    )

    const updatedAuth: MessengerAuthValue = {
      ...auth,
      tokens: { ...auth.tokens, accessToken: newAccessToken },
    }

    await db
      .update(integrationMessengerModel)
      .set({ auth: updatedAuth })
      .where(eq(integrationMessengerModel.id, ctx.id))

    revalidateCacheTags([`workspaces:${ctx.workspaceId}#messenger`])
  } catch (error) {
    logger.error(error, "Failed to refresh Messenger token")
    throw new ChatbotXException("Failed to refresh Messenger token")
  }
}
