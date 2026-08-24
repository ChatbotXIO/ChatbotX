"use server"

import {
  assertPublicUrl,
  integrationApiService,
  workspaceService,
} from "@chatbotx.io/business"
import type { ApiAuthValue } from "@chatbotx.io/integration-api"
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

    const workspaceId = parsedInput.workspaceId ?? undefined
    let ownerId = ctx.user.id

    if (workspaceId) {
      const workspace = await workspaceService.findOrFail({
        where: { id: workspaceId },
      })
      ownerId = workspace.ownerId
    }

    const { token, tokenHash, tokenPrefix } = await generateApiChannelToken()
    const signingSecret = generateSigningSecret()
    const auth: ApiAuthValue = {
      authType: "custom",
      callbackUrl: parsedInput.callbackUrl ?? null,
      signingSecret,
    }

    const result = await integrationApiService.connect({
      ownerId,
      workspaceId,
      name: parsedInput.name,
      auth,
      tokenHash,
      tokenPrefix,
      callbackUrl: parsedInput.callbackUrl ?? null,
      createWorkspace: async (tx) => {
        const workspace = await workspaceService.create({
          tx,
          createdBy: ownerId,
          data: {
            name: parsedInput.name,
            timezone: "UTC",
            ownerId,
          },
        })
        return workspace.id
      },
    })

    return { workspaceId: result.workspaceId, token }
  })
