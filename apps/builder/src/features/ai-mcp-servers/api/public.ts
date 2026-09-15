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
      description:
        "Use this to resolve configured AI MCP servers before inspecting one with `aiMcpServers.get` or adding one with `aiMcpServers.create`. Returns the servers configured in this workspace.",
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
      description:
        "Returns one AI MCP server's configuration. Use `aiMcpServers.list` to find its id first.",
      tags: ["AI MCP Servers"],
    })
    .input(
      z.object({
        id: zodBigintAsString().describe(
          "AI MCP server id. Get it from `aiMcpServers.list`.",
        ),
      }),
    )
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
      description:
        "Registers a remote MCP server the AI agent can call as a tool. Use `aiMcpServers.list` first to avoid duplicating an existing one.",
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
      description:
        "Changes settings on an existing AI MCP server. Call `aiMcpServers.list` to resolve its id first.",
      tags: ["AI MCP Servers"],
    })
    .input(
      updateAIMcpServerRequest.and(
        z.object({
          id: zodBigintAsString().describe(
            "AI MCP server id. Get it from `aiMcpServers.list`.",
          ),
        }),
      ),
    )
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
      description:
        "Permanently deletes an AI MCP server. Use `aiMcpServers.list` to find its id first.",
      successStatus: 204,
      tags: ["AI MCP Servers"],
    })
    .input(
      z.object({
        id: zodBigintAsString().describe(
          "AI MCP server id. Get it from `aiMcpServers.list`.",
        ),
      }),
    )
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
