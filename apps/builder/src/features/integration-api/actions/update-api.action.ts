"use server"

import { assertPublicUrl } from "@chatbotx.io/business"
import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { integrationApiModel } from "@chatbotx.io/database/schema"
import type { ApiAuthValue } from "@chatbotx.io/integration-api"
import {
  type WorkspaceIdAndIdRequestParams,
  workspaceIdAndIdRequestParams,
} from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import type { UpdateApiRequest } from "../schema/mutation"
import { updateApiRequest } from "../schema/mutation"

export const updateApiAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .inputSchema(updateApiRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdAndIdRequestParams
      parsedInput: UpdateApiRequest
    }) => {
      if (parsedInput.callbackUrl) {
        await assertPublicUrl(
          parsedInput.callbackUrl,
          "API channel callback URL",
        )
      }

      const existing = await findOrFail({
        table: integrationApiModel,
        where: { id, workspaceId },
        message: "Integration API not found",
      })

      const auth = existing.auth as ApiAuthValue
      const nextAuth: ApiAuthValue =
        parsedInput.callbackUrl === undefined
          ? auth
          : { ...auth, callbackUrl: parsedInput.callbackUrl }

      await db
        .update(integrationApiModel)
        .set({
          ...(parsedInput.name !== undefined && { name: parsedInput.name }),
          ...(parsedInput.callbackUrl !== undefined && {
            callbackUrl: parsedInput.callbackUrl,
          }),
          auth: nextAuth,
        })
        .where(eq(integrationApiModel.id, id))
    },
  )
