import { aiMcpServerService } from "@chatbotx.io/business"
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
  createAIMcpServerRequest,
  updateAIMcpServerRequest,
} from "../schema/action"
import { publicAIMcpServerResource } from "../schema/public"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("automation")

export const aiMcpServersPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/ai-mcp-servers",
      summary: "List AI MCP servers",
      tags: ["AI MCP Servers"],
    })
    .input(publicListRequest)
    .output(publicListResponse(publicAIMcpServerResource))
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await aiMcpServerService.listAIMcpServers({
          workspaceId: context.workspace.id,
          ...input,
        }),
    ),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/ai-mcp-servers/{id}",
      summary: "Get an AI MCP server by id",
      tags: ["AI MCP Servers"],
    })
    .input(z.object({ id: zodBigintAsString() }))
    .output(publicAIMcpServerResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const mcpServer = await aiMcpServerService.findBy({
        where: { id: input.id, workspaceId: context.workspace.id },
      })
      if (!mcpServer) {
        throw notFoundException("AI MCP server not found")
      }
      return mcpServer
    }),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/ai-mcp-servers",
      summary: "Create an AI MCP server",
      successStatus: 201,
      tags: ["AI MCP Servers"],
    })
    .input(createAIMcpServerRequest)
    .output(publicAIMcpServerResource)
    .errors(possibleErrorsOnCreatingResource)
    .handler(async ({ context, input }) => {
      const [created] = await aiMcpServerService.create(
        context.workspace.id,
        input,
      )
      return created
    }),

  update: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/ai-mcp-servers/{id}",
      summary: "Update an AI MCP server",
      tags: ["AI MCP Servers"],
    })
    .input(updateAIMcpServerRequest.and(z.object({ id: zodBigintAsString() })))
    .output(publicAIMcpServerResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const { id, ...data } = input
      const [updated] = await aiMcpServerService.update(
        { workspaceId: context.workspace.id, id },
        data,
      )
      if (!updated) {
        throw notFoundException("AI MCP server not found")
      }
      return updated
    }),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/ai-mcp-servers/{id}",
      summary: "Delete an AI MCP server",
      successStatus: 204,
      tags: ["AI MCP Servers"],
    })
    .input(z.object({ id: zodBigintAsString() }))
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      const deleted = await aiMcpServerService.delete({
        workspaceId: context.workspace.id,
        id: input.id,
      })
      if (deleted.length === 0) {
        throw notFoundException("AI MCP server not found")
      }
    }),
}
