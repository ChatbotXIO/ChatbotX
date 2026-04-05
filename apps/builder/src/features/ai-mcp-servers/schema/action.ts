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
  url: z.url(),
  auth: aiMcpServerAuth,
})
export type BaseAIMcpServerRequest = z.infer<typeof baseAIMcpServerRequest>

export const createAIMcpServerRequest = baseAIMcpServerRequest.extend({
  name: z.string().trim().min(1),
  availableTools: z.record(z.string(), z.any()),
  selectedTools: z.array(z.string()),
})
export type CreateAIMcpServerRequest = z.infer<typeof createAIMcpServerRequest>

export const validateAIMcpServerRequest = baseAIMcpServerRequest
export type ValidateAIMcpServerRequest = z.infer<
  typeof validateAIMcpServerRequest
>
