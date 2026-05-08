import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import { integrationWhatsappResource } from "../../schemas/resource"
import { whatsappFlowResource } from "./resource"

export const listWhatsappFlowsRequest = z.object({
  workspaceId: zodBigintAsString(),
  inboxId: zodBigintAsString().optional(),
  integrationWhatsappId: zodBigintAsString().optional(),
})
export type ListWhatsappFlowsRequest = z.infer<typeof listWhatsappFlowsRequest>

export const listWhatsappFlowsResponse = z.array(
  whatsappFlowResource.extend({
    integrationWhatsapp: integrationWhatsappResource,
  }),
)
export type ListWhatsappFlowsResponse = z.infer<
  typeof listWhatsappFlowsResponse
>

export const whatsappFlowScreenOutputSchema = z.object({
  value: z.string(),
  label: z.string(),
})

export const whatsappFlowScreenSchema = z.object({
  id: z.string(),
  title: z.string(),
  terminal: z.boolean(),
  output: z.array(whatsappFlowScreenOutputSchema),
})
export type WhatsappFlowScreenResource = z.infer<
  typeof whatsappFlowScreenSchema
>

export const getWhatsappFlowScreensRequest = z.object({
  workspaceId: zodBigintAsString(),
  flowId: zodBigintAsString(),
})
export type GetWhatsappFlowScreensRequest = z.infer<
  typeof getWhatsappFlowScreensRequest
>

export const getWhatsappFlowScreensResponse = z.object({
  screens: z.array(whatsappFlowScreenSchema),
})
export type GetWhatsappFlowScreensResponse = z.infer<
  typeof getWhatsappFlowScreensResponse
>
