"use server"

import {
  assertPublicUrl,
  connectChannelIntegration,
  workspaceService,
} from "@chatbotx.io/business"
import { db } from "@chatbotx.io/database/client"
import { integrationTypes } from "@chatbotx.io/database/partials"
import { integrationApiModel } from "@chatbotx.io/database/schema"
import type { ApiAuthValue } from "@chatbotx.io/integration-api"
import { createId } from "@chatbotx.io/utils"
import { authActionClient } from "@/lib/safe-action"
import {
  generateApiChannelToken,
  generateSigningSecret,
} from "../lib/generate-credentials"
import { createApiRequest } from "../schema/mutation"

export const createApiAction = authActionClient
  .inputSchema(createApiRequest)
  .action(async ({ parsedInput, ctx }) => {
    if (parsedInput.callbackUrl) {
      await assertPublicUrl(parsedInput.callbackUrl, "API channel callback URL")
    }

    let workspaceId = parsedInput.workspaceId
    let ownerId = ctx.user.id

    if (workspaceId) {
      const workspace = await workspaceService.findOrFail({
        where: { id: workspaceId },
      })
      ownerId = workspace.ownerId
    }

    const { token, tokenHash, tokenPrefix } = generateApiChannelToken()
    const signingSecret = generateSigningSecret()

    const result = await db.transaction(async (tx) => {
      if (!workspaceId) {
        const workspace = await workspaceService.create({
          tx,
          createdBy: ownerId,
          data: {
            name: parsedInput.name,
            timezone: "UTC",
            ownerId,
          },
        })
        workspaceId = workspace.id
      }

      const apiId = createId()
      const auth: ApiAuthValue = {
        authType: "custom",
        callbackUrl: parsedInput.callbackUrl ?? null,
        signingSecret,
      }

      await connectChannelIntegration({
        tx,
        ownerId,
        inboxData: {
          id: apiId,
          workspaceId: workspaceId as string,
          name: parsedInput.name,
          channel: integrationTypes.enum.api,
          sourceId: apiId,
        },
        insertIntegration: async (inboxId) => {
          await tx.insert(integrationApiModel).values({
            id: apiId,
            inboxId,
            workspaceId: workspaceId as string,
            name: parsedInput.name,
            auth,
            tokenHash,
            tokenPrefix,
            callbackUrl: parsedInput.callbackUrl ?? null,
            enabled: true,
          })
        },
      })

      return { workspaceId: workspaceId as string }
    })

    return { workspaceId: result.workspaceId, token }
  })
