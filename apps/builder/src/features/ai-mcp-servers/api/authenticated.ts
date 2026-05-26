import { ChatbotXException } from "@chatbotx.io/business/errors"
import { normalizeError } from "universal-error-normalizer"
import z from "zod"
import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { validateAIMcpServer } from "../actions/validate-ai-mcp-server.action"
import { listAIMcpServers } from "../queries"
import {
  listAIMcpServersRequest,
  listAIMcpServersResponse,
  validateAIMcpServerRequest,
} from "../schemas/action"

export const aiMcpServersAuthenticatedAPI = {
  validateAIMcpServerAuthenticatedAPI: authorizedAPI
    .route({
      method: "POST",
      path: "/workspaces/{workspaceId}/ai-mcp-servers/validate",
      summary: "Validar servidor MCP",
      tags: ["IA"],
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
      summary: "Listar servidores MCP de IA",
      tags: ["Servidores MCP de IA"],
    })
    .input(listAIMcpServersRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listAIMcpServersResponse)
    .handler(async ({ input }) => await listAIMcpServers(input)),
}
