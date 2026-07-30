import {
  DEFAULT_API_VERSION,
  META_CATALOG_PRODUCT_PAGE_SIZE,
} from "../constants"
import { graphAuthHeaders, metaCatalogGraphClient } from "../lib/http-client"
import type { MetaCatalogProductPage } from "../schemas"
import { metaCatalogRemoteProductSchema } from "../schemas"

const PRODUCT_FIELDS = [
  "id",
  "retailer_id",
  "name",
  "description",
  "short_description",
  "price",
  "sale_price",
  "currency",
  "image_url",
  "additional_image_urls",
  "images",
  "image_cdn_urls",
  "additional_image_cdn_urls",
  "availability",
  "brand",
  "product_type",
  "quantity_to_sell_on_facebook",
  "custom_label_0",
  "custom_label_1",
  "custom_label_2",
  "custom_label_3",
  "custom_label_4",
  "url",
] as const

type ProductsResponse = {
  data?: unknown[]
  paging?: {
    cursors?: { after?: string }
    next?: string
  }
}

export async function getCatalogProductsPage(input: {
  accessToken: string
  catalogId: string
  after?: string
  version?: string
}): Promise<MetaCatalogProductPage> {
  const version = input.version ?? DEFAULT_API_VERSION
  const response = await metaCatalogGraphClient.get<ProductsResponse>(
    `${version}/${input.catalogId}/products`,
    {
      headers: graphAuthHeaders(input.accessToken),
      searchParams: {
        fields: PRODUCT_FIELDS.join(","),
        limit: String(META_CATALOG_PRODUCT_PAGE_SIZE),
        ...(input.after ? { after: input.after } : {}),
      },
    },
  )
  const parsedProducts = (response.data.data ?? []).map((product) =>
    metaCatalogRemoteProductSchema.safeParse(product),
  )
  return {
    products: parsedProducts
      .filter((result) => result.success)
      .map((result) => result.data),
    invalidCount: parsedProducts.filter((result) => !result.success).length,
    nextCursor: response.data.paging?.next
      ? response.data.paging.cursors?.after
      : undefined,
  }
}
