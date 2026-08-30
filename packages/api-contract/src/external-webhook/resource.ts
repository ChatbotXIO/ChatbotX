import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

export const publicExternalWebhookResource = z.object({
  id: z.string(),
  provider: z.string(),
  event: z.string(),
  url: z.string(),
})
export type PublicExternalWebhookResource = z.infer<
  typeof publicExternalWebhookResource
>

export const publicListExternalWebhooksResponse = z.object({
  data: z.array(publicExternalWebhookResource),
})
export type PublicListExternalWebhooksResponse = z.infer<
  typeof publicListExternalWebhooksResponse
>

export const createExternalWebhookInput = z.object({
  url: z.string().trim().url(),
  event: z.string().trim().min(1).max(100),
  provider: z.enum(["make", "n8n"]).default("make"),
})
export type CreateExternalWebhookInput = z.infer<
  typeof createExternalWebhookInput
>

export const deleteExternalWebhookInput = z.object({
  id: zodBigintAsString(),
})
export type DeleteExternalWebhookInput = z.infer<
  typeof deleteExternalWebhookInput
>
