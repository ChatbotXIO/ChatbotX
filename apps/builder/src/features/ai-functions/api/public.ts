import { aiFunctionService } from "@chatbotx.io/business"
import { notFoundException } from "@chatbotx.io/business/errors"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { mcpSpec } from "@/lib/orpc/mcp-annotations"
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
      description:
        "Use this to resolve configured AI functions before inspecting one with `aiFunctions.get` or adding one with `aiFunctions.create`. Returns the functions available in this workspace.",
      tags: ["AI Functions"],
      spec: mcpSpec({ visibility: "default" }),
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
      summary: "Get AI function",
      description:
        "Returns one AI function's configuration. Use `aiFunctions.list` to find its id first.",
      tags: ["AI Functions"],
    })
    .input(
      z.object({
        id: zodBigintAsString().describe(
          "AI function id. Get it from `aiFunctions.list`.",
        ),
      }),
    )
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
      summary: "Create AI function",
      description:
        "Adds a callable AI function definition to the workspace. Use `aiFunctions.list` first to avoid duplicating an existing one.",
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
      summary: "Update AI function",
      description:
        "Changes settings on an existing AI function. Call `aiFunctions.list` to resolve its id first.",
      tags: ["AI Functions"],
    })
    .input(
      updateAIFunctionRequest.and(
        z.object({
          id: zodBigintAsString().describe(
            "AI function id. Get it from `aiFunctions.list`.",
          ),
        }),
      ),
    )
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
      summary: "Delete AI function",
      description:
        "Permanently deletes an AI function. Use `aiFunctions.list` to find its id first.",
      successStatus: 204,
      tags: ["AI Functions"],
    })
    .input(
      z.object({
        id: zodBigintAsString().describe(
          "AI function id. Get it from `aiFunctions.list`.",
        ),
      }),
    )
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await aiFunctionService.deleteAIFunction({
        workspaceId: context.workspace.id,
        aiFunctionId: input.id,
      })
    }),
}
