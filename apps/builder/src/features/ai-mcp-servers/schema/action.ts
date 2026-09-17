import { aiMcpServerAuth } from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { parseBotFieldVariableText } from "@chatbotx.io/variables/bot-field-variable"
import { z } from "zod"
import { aiMcpServerResource } from "./resource"

const isPrivateBotFieldVariableText = (text: string): boolean =>
  parseBotFieldVariableText(text).status === "valid"

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

const privateAIMcpServerAuth = z.discriminatedUnion("type", [
  z.object({ type: z.literal("none") }),
  z.object({
    type: z.literal("token"),
    token: z.string().trim().min(1).refine(isPrivateBotFieldVariableText),
  }),
  z.object({
    type: z.literal("header"),
    headers: z.array(
      z.object({
        header: z.string().trim().min(1),
        value: z.string().trim().min(1),
      }),
    ),
  }),
])

const privateBaseAIMcpServerRequest = z.object({
  url: z.url(),
  auth: privateAIMcpServerAuth,
})

/** Private Builder form schema. Public API schemas above intentionally remain unchanged. */
export const createPrivateAIMcpServerRequest = createAIMcpServerRequest.extend({
  auth: privateAIMcpServerAuth,
})
export type CreatePrivateAIMcpServerRequest = z.infer<
  typeof createPrivateAIMcpServerRequest
>

export const updatePrivateAIMcpServerRequest = updateAIMcpServerRequest.extend({
  auth: privateAIMcpServerAuth,
})
export type UpdatePrivateAIMcpServerRequest = z.infer<
  typeof updatePrivateAIMcpServerRequest
>

export const validatePrivateAIMcpServerRequest = privateBaseAIMcpServerRequest
export type ValidatePrivateAIMcpServerRequest = z.infer<
  typeof validatePrivateAIMcpServerRequest
>
