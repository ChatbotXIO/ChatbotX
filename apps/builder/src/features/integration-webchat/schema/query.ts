import { z } from "zod"
import { integrationWebchatResource } from "../../integration-webchat/schema/resource"

export const listIntegrationWebchatsRequest = z.object({
  page: z.number().optional(),
  perPage: z.number().optional(),
})
export type ListIntegrationWebchatsRequest = z.infer<
  typeof listIntegrationWebchatsRequest
>

export const listIntegrationWebchatsResponse = z.object({
  data: z.array(integrationWebchatResource),
  pageCount: z.number(),
})
export type ListIntegrationWebchatsResponse = z.infer<
  typeof listIntegrationWebchatsResponse
>
