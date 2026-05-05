"use server"

import { ChatbotXException } from "@chatbotx.io/business/errors"
import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { integrationZaloModel } from "@chatbotx.io/database/schema"
import type { ZaloAuthValue } from "@chatbotx.io/integration-zalo"
import {
  calculateExpiresAt,
  refreshAccessToken,
} from "@chatbotx.io/integration-zalo"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { revalidateCacheTags } from "@/lib/cache-helper"
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
  const integrationZalo = await findOrFail({
    table: integrationZaloModel,
    where: { id: ctx.id, workspaceId: ctx.workspaceId },
    message: "Integration Zalo not found",
  })

  const auth = integrationZalo.auth as ZaloAuthValue

  if (!auth.tokens.refreshToken) {
    throw new ChatbotXException("Zalo refresh token not available")
  }

  try {
    const newTokens = await refreshAccessToken(auth, auth.tokens.refreshToken)

    const updatedAuth: ZaloAuthValue = {
      ...auth,
      tokens: {
        ...auth.tokens,
        expiresAt: calculateExpiresAt(newTokens.expires_in),
        accessToken: newTokens.access_token,
        refreshToken: newTokens.refresh_token,
      },
    }

    await db
      .update(integrationZaloModel)
      .set({ auth: updatedAuth })
      .where(eq(integrationZaloModel.id, ctx.id))

    revalidateCacheTags(`workspaces:${ctx.workspaceId}#zalos`)
  } catch (error) {
    logger.error(error, "Failed to refresh Zalo permissions")
    throw new ChatbotXException("Failed to refresh Zalo permissions")
  }
}
