import { aiFunctionService } from "@chatbotx.io/business"
import { notFoundException } from "@chatbotx.io/business/errors"
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
  createAIFunctionRequest,
  updateAIFunctionRequest,
} from "../schema/action"
import { aiFunctionResource } from "../schema/resource"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("automation")

export const aiFunctionsPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/ai-functions",
      summary: "List AI functions",
      tags: ["AI Functions"],
    })
    .input(publicListRequest)
    .output(publicListResponse(aiFunctionResource))
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await aiFunctionService.listAIFunctions({
          workspaceId: context.workspace.id,
          ...input,
        }),
    ),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/ai-functions/{id}",
      summary: "Get an AI function by id",
      tags: ["AI Functions"],
    })
    .input(z.object({ id: zodBigintAsString() }))
    .output(aiFunctionResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const aiFunction = await aiFunctionService.findBy({
        where: { id: input.id, workspaceId: context.workspace.id },
      })
      if (!aiFunction) {
        throw notFoundException("AI function not found")
      }
      return aiFunction
    }),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/ai-functions",
      summary: "Create an AI function",
      successStatus: 201,
      tags: ["AI Functions"],
    })
    .input(createAIFunctionRequest)
    .output(aiFunctionResource)
    .errors(possibleErrorsOnCreatingResource)
    .handler(async ({ context, input }) => {
      const [created] = await aiFunctionService.create(
        context.workspace.id,
        input,
      )
      return created
    }),

  update: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/ai-functions/{id}",
      summary: "Update an AI function",
      tags: ["AI Functions"],
    })
    .input(updateAIFunctionRequest.and(z.object({ id: zodBigintAsString() })))
    .output(aiFunctionResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const { id, ...data } = input
      return await aiFunctionService.updateAIFunction(
        { workspaceId: context.workspace.id, id },
        data,
      )
    }),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/ai-functions/{id}",
      summary: "Delete an AI function",
      successStatus: 204,
      tags: ["AI Functions"],
    })
    .input(z.object({ id: zodBigintAsString() }))
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await aiFunctionService.deleteAIFunction({
        workspaceId: context.workspace.id,
        aiFunctionId: input.id,
      })
    }),
}
