import { integrationWhatsappResource } from "@chatbotx.io/business"
import { whatsappTemplateStatusSchema } from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import { whatsappMessageTemplateResource } from "./resource"

export const listWhatsappMessageTemplatesRequest = z.object({
  workspaceId: zodBigintAsString(),
  inboxId: zodBigintAsString().optional(),
  integrationWhatsappId: zodBigintAsString().optional(),
  status: whatsappTemplateStatusSchema.optional(),
})
export type ListWhatsappMessageTemplatesRequest = z.infer<
  typeof listWhatsappMessageTemplatesRequest
>

export const listWhatsappMessageTemplatesResponse = z.array(
  whatsappMessageTemplateResource.extend({
    integrationWhatsapp: integrationWhatsappResource,
  }),
)
export type ListWhatsappMessageTemplatesResponse = z.infer<
  typeof listWhatsappMessageTemplatesResponse
>

export const searchMetaCatalogProductsRequest = z.object({
  workspaceId: zodBigintAsString(),
  keyword: z.string().trim().max(200).optional(),
})
export type SearchMetaCatalogProductsRequest = z.infer<
  typeof searchMetaCatalogProductsRequest
>

export const metaCatalogProductOptionResource = z.object({
  retailerId: z.string(),
  name: z.string(),
  imageUrl: z.string().nullable(),
})
export type MetaCatalogProductOptionResource = z.infer<
  typeof metaCatalogProductOptionResource
>

export const searchMetaCatalogProductsResponse = z.object({
  connected: z.boolean(),
  items: z.array(metaCatalogProductOptionResource),
})
export type SearchMetaCatalogProductsResponse = z.infer<
  typeof searchMetaCatalogProductsResponse
>
