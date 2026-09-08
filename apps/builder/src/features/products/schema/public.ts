import { inventoryPolicyTypes } from "@chatbotx.io/database/partials"
import { createSelectSchema, productModel } from "@chatbotx.io/database/schema"
import { z } from "zod"
import { productFormRequest } from "./action"

// Explicit allow-list, not the whole row: every field picked here becomes a
// stable contract MCP agents depend on (see products/schema/resource.ts for
// the internal, unrestricted shape).
export const publicProductResource = createSelectSchema(productModel, {
  id: z.string(),
  workspaceId: z.string(),
  categoryId: z.string().nullable(),
  subcategoryId: z.string().nullable(),
  images: z.array(
    z.object({ url: z.string(), type: z.enum(["link", "file"]) }),
  ),
  tags: z.array(z.string()),
  inventoryPolicy: inventoryPolicyTypes,
}).pick({
  id: true,
  workspaceId: true,
  name: true,
  shortDescription: true,
  longDescription: true,
  price: true,
  taxes: true,
  discount: true,
  currency: true,
  productUrl: true,
  sku: true,
  inventoryPolicy: true,
  inventoryQuantity: true,
  allowOutOfStockPurchase: true,
  images: true,
  tags: true,
  vendor: true,
  rank: true,
  categoryId: true,
  subcategoryId: true,
  isActive: true,
  isSearchable: true,
  allowSpecialRequest: true,
  isAddonOnly: true,
  createdAt: true,
  updatedAt: true,
})

const variantOption = z.object({
  name: z.string(),
  values: z.array(z.string()),
  position: z.number(),
})

const variant = z.object({
  combination: z.record(z.string(), z.string()),
  price: z.number(),
  isEnabled: z.boolean(),
})

const addon = z.object({
  name: z.string(),
  maxSelections: z.number(),
  addonProductIds: z.array(z.string()),
})

export const publicProductDetailResource = publicProductResource.extend({
  variantOptions: z.array(variantOption),
  variants: z.array(variant),
  addons: z.array(addon),
})

export const listProductsPublicResponse = z.object({
  data: z.array(publicProductResource),
  pageCount: z.number(),
})

export const createProductPublicRequest = productFormRequest
export const updateProductPublicRequest = productFormRequest
