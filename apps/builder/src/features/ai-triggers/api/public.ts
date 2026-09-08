import { aiTriggerService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { publicListRequest, publicListResponse } from "@/lib/public-api/list"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  createAITriggerRequest,
  updateAITriggerRequest,
} from "../schema/action"
import { aiTriggerResource } from "../schema/resource"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("automation")

export const aiTriggersPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/ai-triggers",
      summary: "List AI triggers",
      tags: ["AI Triggers"],
    })
    .input(publicListRequest)
    .output(publicListResponse(aiTriggerResource))
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await aiTriggerService.list({
          ...input,
          workspaceId: context.workspace.id,
        }),
    ),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/ai-triggers/{id}",
      summary: "Get an AI trigger by id",
      tags: ["AI Triggers"],
    })
    .input(z.object({ id: zodBigintAsString() }))
    .output(aiTriggerResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await aiTriggerService.findOrFail({
          workspaceId: context.workspace.id,
          id: input.id,
        }),
    ),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/ai-triggers",
      summary: "Create an AI trigger",
      successStatus: 201,
      tags: ["AI Triggers"],
    })
    .input(createAITriggerRequest)
    .output(aiTriggerResource)
    .errors(possibleErrorsOnCreatingResource)
    .handler(
      async ({ context, input }) =>
        await aiTriggerService.create({
          workspaceId: context.workspace.id,
          data: input,
        }),
    ),

  update: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/ai-triggers/{id}",
      summary: "Update an AI trigger",
      tags: ["AI Triggers"],
    })
    .input(updateAITriggerRequest.and(z.object({ id: zodBigintAsString() })))
    .output(aiTriggerResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const { id, ...data } = input
      return await aiTriggerService.update(
        { workspaceId: context.workspace.id, id },
        data,
      )
    }),

  duplicate: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/ai-triggers/{id}/duplicate",
      summary: "Duplicate an AI trigger",
      successStatus: 201,
      tags: ["AI Triggers"],
    })
    .input(z.object({ id: zodBigintAsString() }))
    .output(aiTriggerResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(
      async ({ context, input }) =>
        await aiTriggerService.duplicate({
          workspaceId: context.workspace.id,
          id: input.id,
        }),
    ),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/ai-triggers/{id}",
      summary: "Delete an AI trigger",
      successStatus: 204,
      tags: ["AI Triggers"],
    })
    .input(z.object({ id: zodBigintAsString() }))
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await aiTriggerService.deleteMany({
        workspaceId: context.workspace.id,
        ids: [input.id],
      })
    }),
}
