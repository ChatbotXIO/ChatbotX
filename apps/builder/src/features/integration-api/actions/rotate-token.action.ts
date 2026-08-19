"use server"

import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { integrationApiModel } from "@chatbotx.io/database/schema"
import {
  type WorkspaceIdAndIdRequestParams,
  workspaceIdAndIdRequestParams,
} from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import { generateApiChannelToken } from "../lib/generate-credentials"

export const rotateApiTokenAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId, id],
    }: {
      bindArgsParsedInputs: WorkspaceIdAndIdRequestParams
    }) => {
      await findOrFail({
        table: integrationApiModel,
        where: { id, workspaceId },
        message: "Integration API not found",
      })

      const { token, tokenHash, tokenPrefix } = generateApiChannelToken()

      await db
        .update(integrationApiModel)
        .set({ tokenHash, tokenPrefix })
        .where(eq(integrationApiModel.id, id))

      return { token }
    },
  )
