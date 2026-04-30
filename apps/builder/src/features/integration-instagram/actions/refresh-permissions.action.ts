"use server"

import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { integrationInstagramModel } from "@chatbotx.io/database/schema"
import type { InstagramAuthValue } from "@chatbotx.io/integration-instagram"
import { exchangeLongLivedToken } from "@chatbotx.io/integration-instagram"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { ChatbotXException } from "@/lib/errors/exception"
import { logger } from "@/lib/log"
import { workspaceActionClient } from "@/lib/safe-action"

export const refreshInstagramPermissionsAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
    } = props

    await refreshInstagramPermissions({ workspaceId, id })
  })

const refreshInstagramPermissions = async (ctx: {
  workspaceId: string
  id: string
}) => {
  const integrationInstagram = await findOrFail({
    table: integrationInstagramModel,
    where: { id: ctx.id, workspaceId: ctx.workspaceId },
    message: "Integration Instagram not found",
  })

  const auth = integrationInstagram.auth as InstagramAuthValue

  try {
    const newAccessToken = await exchangeLongLivedToken(
      {
        clientId: auth.clientId,
        clientSecret: auth.clientSecret,
        version: auth.metadata.version,
      },
      auth.tokens.accessToken,
    )

    const updatedAuth: InstagramAuthValue = {
      ...auth,
      tokens: { ...auth.tokens, accessToken: newAccessToken },
    }

    await db
      .update(integrationInstagramModel)
      .set({ auth: updatedAuth })
      .where(eq(integrationInstagramModel.id, ctx.id))

    revalidateCacheTags([`workspaces:${ctx.workspaceId}#instagram`])
  } catch (error) {
    logger.error(error, "Failed to refresh Instagram token")
    throw new ChatbotXException("Failed to refresh Instagram token")
  }
}
