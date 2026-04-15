import { normalizeError } from "universal-error-normalizer"
import z from "zod"
import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"
import { ChatbotXException } from "@/lib/errors/exception"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { validateAIMcpServer } from "../actions/validate-ai-mcp-server.action"
import { listAIMcpServers } from "../queries"
import {
  listAIMcpServersRequest,
  listAIMcpServersResponse,
  validateAIMcpServerRequest,
} from "../schema/action"

export const aiMcpServersAuthenticatedAPI = {
  validateAIMcpServerAuthenticatedAPI: authorizedAPI
    .route({
      method: "POST",
      path: "/workspaces/{workspaceId}/ai-mcp-servers/validate",
      summary: "Validate an MCP server",
      tags: ["AI"],
    })
    .input(validateAIMcpServerRequest.and(withWorkspaceIdSchema))
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(z.any())
    .handler(async ({ input }) => {
      try {
        return await validateAIMcpServer({ parsedInput: input })
      } catch (err) {
        const error = normalizeError(err)
        throw new ChatbotXException(error.message, error.code)
      }
    }),

  listAIMcpServersAuthenticatedAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/ai-mcp-servers",
      summary: "List AI MCP servers",
      tags: ["AI MCP Servers"],
    })
    .input(listAIMcpServersRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listAIMcpServersResponse)
    .handler(async ({ input }) => {
      return await listAIMcpServers(input)
    }),
}
