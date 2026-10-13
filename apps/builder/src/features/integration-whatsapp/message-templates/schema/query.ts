import { integrationWhatsappResource } from "@chatbotx.io/business"
import { whatsappTemplateStatusSchema } from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import {
  metaCatalogItemPublicResource,
  searchMetaCatalogItemsPublicRequest,
  searchMetaCatalogItemsPublicResponse,
} from "@/features/products/schema/public"
import { whatsappMessageTemplateResource } from "./resource"

export const listWhatsappMessageTemplatesRequest = z.object({
  workspaceId: zodBigintAsString(),
  inboxId: zodBigintAsString()
    .optional()
    .describe(
      "Restrict to templates connected to this inbox. Get it from `inboxes.list`.",
    ),
  integrationWhatsappId: zodBigintAsString()
    .optional()
    .describe("Restrict to templates on this WhatsApp integration."),
  status: whatsappTemplateStatusSchema
    .optional()
    .describe("Restrict to templates with this approval status."),
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

// The picker and the public API search the same catalog, so the picker's
// schemas are derived from the public ones instead of repeating them.
export const searchMetaCatalogProductsRequest =
  searchMetaCatalogItemsPublicRequest.extend({
    workspaceId: zodBigintAsString(),
  })
export type SearchMetaCatalogProductsRequest = z.infer<
  typeof searchMetaCatalogProductsRequest
>

export const metaCatalogProductOptionResource = metaCatalogItemPublicResource
export type MetaCatalogProductOptionResource = z.infer<
  typeof metaCatalogProductOptionResource
>

export const searchMetaCatalogProductsResponse =
  searchMetaCatalogItemsPublicResponse
export type SearchMetaCatalogProductsResponse = z.infer<
  typeof searchMetaCatalogProductsResponse
>
