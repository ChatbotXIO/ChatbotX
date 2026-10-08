"use server"

import {
  hasWorkspaceAccess,
  integrationApiService,
  workspaceService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { authActionClient } from "@/lib/safe-action"
import { createApiRequest } from "../schema/mutation"

export const createApiAction = authActionClient
  .inputSchema(createApiRequest)
  .action(async ({ parsedInput, ctx }) => {
    const workspaceId = parsedInput.workspaceId ?? undefined
    let ownerId = ctx.user.id

    if (workspaceId) {
      if (!(await hasWorkspaceAccess({ workspaceId, user: ctx.user }))) {
        throw new ChatbotXException("Workspace not found", "notFound", 404)
      }
      const workspace = await workspaceService.findOrFail({
        where: { id: workspaceId },
      })
      ownerId = workspace.ownerId
    }

    const result = await integrationApiService.createWithToken({
      ownerId,
      actorUserId: ctx.user.id,
      workspaceId,
      name: parsedInput.name,
      callbackUrl: parsedInput.callbackUrl,
      createWorkspace: async (tx, quotaConsumption) => {
        const workspace = await workspaceService.create({
          tx,
          createdBy: ownerId,
          data: {
            name: parsedInput.name,
            timezone: "UTC",
            ownerId,
          },
          quotaConsumption,
        })
        return workspace.id
      },
    })

    return { workspaceId: result.workspaceId, token: result.token }
  })
