import { aiMcpServerAuth } from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { aiMcpServerResource } from "./resource"

export const listAIMcpServersRequest = z.object({
  workspaceId: zodBigintAsString(),
})
export type ListAIMcpServersRequest = z.infer<typeof listAIMcpServersRequest>

export const listAIMcpServersResponse = z.object({
  data: z.array(aiMcpServerResource),
})
export type ListAIMcpServersResponse = z.infer<typeof listAIMcpServersResponse>

const baseAIMcpServerRequest = z.object({
  url: z.url().describe("MCP server endpoint URL."),
  auth: aiMcpServerAuth.describe(
    "Authentication configuration for connecting to the server.",
  ),
})
export type BaseAIMcpServerRequest = z.infer<typeof baseAIMcpServerRequest>

export const createAIMcpServerRequest = baseAIMcpServerRequest.extend({
  name: z.string().trim().min(1).describe("AI MCP server name."),
  availableTools: z
    .record(z.string(), z.any())
    .describe("Tools discovered on the server, keyed by tool name."),
  selectedTools: z
    .array(z.string())
    .describe("Names of the discovered tools the AI agent is allowed to call."),
})
export type CreateAIMcpServerRequest = z.infer<typeof createAIMcpServerRequest>

export const updateAIMcpServerRequest = createAIMcpServerRequest
export type UpdateAIMcpServerRequest = z.infer<typeof updateAIMcpServerRequest>

export const validateAIMcpServerRequest = baseAIMcpServerRequest
export type ValidateAIMcpServerRequest = z.infer<
  typeof validateAIMcpServerRequest
>
