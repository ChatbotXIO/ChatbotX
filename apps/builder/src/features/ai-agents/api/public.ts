import { aiAgentService } from "@chatbotx.io/business"
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
import { publicListRequest } from "@/lib/public-api/list"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { createAIAgentRequest, updateAIAgentRequest } from "../schema/action"
import { listAIAgentsResponse } from "../schema/query"
import { aiAgentResourceSchema } from "../schema/resource"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("automation")

export const aiAgentsPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/ai-agents",
      summary: "List AI agents",
      description:
        "Use this to resolve an AI agent before referencing it in `flows.publish` or changing it with `aiAgents.update`. Returns the configured agents in the workspace.",
      tags: ["AI Agents"],
      spec: mcpSpec({ visibility: "default" }),
    })
    .input(publicListRequest)
    .output(listAIAgentsResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await aiAgentService.listAIAgents({
          workspaceId: context.workspace.id,
          ...input,
          sort: [{ id: "createdAt", desc: true }],
        }),
    ),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/ai-agents/{id}",
      summary: "Get an AI agent by id",
      tags: ["AI Agents"],
    })
    .input(z.object({ id: zodBigintAsString() }))
    .output(aiAgentResourceSchema)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const aiAgent = await aiAgentService.findBy({
        where: { id: input.id, workspaceId: context.workspace.id },
      })
      if (!aiAgent) {
        throw notFoundException("AI agent not found")
      }
      return aiAgent
    }),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/ai-agents",
      summary: "Create an AI agent",
      description:
        "Adds a configured AI agent to the workspace. Use `aiAgents.list` first to avoid duplicating an existing agent, then use `aiAgents.update` to refine its settings.",
      successStatus: 201,
      tags: ["AI Agents"],
      spec: mcpSpec({ visibility: "default" }),
    })
    .input(createAIAgentRequest)
    .output(aiAgentResourceSchema)
    .errors(possibleErrorsOnCreatingResource)
    .handler(
      async ({ context, input }) =>
        await aiAgentService.createAndReturn(context.workspace.id, input),
    ),

  update: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/ai-agents/{id}",
      summary: "Update an AI agent",
      description:
        "Changes settings on an existing AI agent without replacing unrelated fields. Call `aiAgents.list` to resolve its id, and use `aiAgents.get` to inspect the saved result.",
      tags: ["AI Agents"],
      spec: mcpSpec({ visibility: "default" }),
    })
    .input(updateAIAgentRequest.and(z.object({ id: zodBigintAsString() })))
    .output(aiAgentResourceSchema)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const { id, ...data } = input
      return await aiAgentService.updateAIAgent(
        { workspaceId: context.workspace.id, id },
        data,
      )
    }),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/ai-agents/{id}",
      summary: "Delete an AI agent",
      successStatus: 204,
      tags: ["AI Agents"],
    })
    .input(z.object({ id: zodBigintAsString() }))
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await aiAgentService.delete({
        workspaceId: context.workspace.id,
        ids: [input.id],
      })
    }),
}
