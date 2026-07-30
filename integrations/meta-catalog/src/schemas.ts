import { z } from "zod"

export const metaCatalogAuthSchema = z.object({
  accessToken: z.string().trim().min(1),
  expiresAt: z.string().datetime().optional(),
  version: z.string().trim().optional(),
})
export type MetaCatalogAuthValue = z.infer<typeof metaCatalogAuthSchema>

export const metaCatalogSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  businessId: z.string().optional(),
})
export type MetaCatalog = z.infer<typeof metaCatalogSchema>

export const metaCatalogBusinessSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
})
export type MetaCatalogBusiness = z.infer<typeof metaCatalogBusinessSchema>

export const metaCatalogBatchMethodSchema = z.enum(["CREATE", "UPDATE"])
export type MetaCatalogBatchMethod = z.infer<
  typeof metaCatalogBatchMethodSchema
>

export type MetaCatalogBatchRequest = {
  method: MetaCatalogBatchMethod
  retailerId: string
  data: MetaCatalogProductData
}

export type MetaCatalogProductData = {
  title: string
  description: string
  short_description?: string
  availability: string
  condition: "new"
  image: Array<{ url: string; tag: string[] }>
  link: string
  price: string
  sale_price: string
  brand: string
  product_type: string
  quantity_to_sell_on_facebook: number
  custom_label_0: string
  custom_label_1: string
  custom_label_2: string
  custom_label_3: string
  custom_label_4: string
}

export type MetaCatalogBatchItemResult = {
  retailerId: string
  success: boolean
  error?: string
}

export const metaCatalogRemoteProductSchema = z
  .object({
    id: z.string().optional(),
    retailer_id: z.string().optional(),
    name: z.string().optional(),
    description: z.string().optional(),
    short_description: z.string().optional(),
    price: z.union([z.number(), z.string()]).optional(),
    sale_price: z.union([z.number(), z.string()]).optional(),
    currency: z.string().optional(),
    image_url: z.string().optional(),
    additional_image_urls: z.array(z.string()).optional(),
    // Meta may return localized image objects or locale-keyed maps here.
    // Preserve the raw shapes and normalize them in the inbound mapper.
    images: z.unknown().optional(),
    image_cdn_urls: z.unknown().optional(),
    additional_image_cdn_urls: z.unknown().optional(),
    image_fetch_status: z.unknown().optional(),
    availability: z.string().optional(),
    brand: z.string().optional(),
    product_type: z.string().optional(),
    quantity_to_sell_on_facebook: z.union([z.number(), z.string()]).optional(),
    custom_label_0: z.string().optional(),
    custom_label_1: z.string().optional(),
    custom_label_2: z.string().optional(),
    custom_label_3: z.string().optional(),
    custom_label_4: z.string().optional(),
    url: z.string().optional(),
  })
  .passthrough()
export type MetaCatalogRemoteProduct = z.infer<
  typeof metaCatalogRemoteProductSchema
>

export type MetaCatalogProductPage = {
  products: MetaCatalogRemoteProduct[]
  invalidCount: number
  nextCursor?: string
}
