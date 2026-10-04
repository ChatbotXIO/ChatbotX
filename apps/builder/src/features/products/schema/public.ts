import {
  inventoryPolicyTypes,
  metaCatalogSyncScopes,
} from "@chatbotx.io/database/partials"
import {
  createSelectSchema,
  integrationMetaCatalogModel,
  metaCatalogSyncRunModel,
  productModel,
} from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { isMetaCatalogSyncScopeComplete } from "../lib/meta-catalog-operations"
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
// PUT is a full replacement: `name` must be explicitly given (no
// server-filled default) so a caller cannot silently wipe it by omission.
// Every other field keeps `productFormRequest`'s default-on-omit behavior —
// unlike `name`, resetting them to their default when unspecified is the
// correct "replace" semantics, not a partial-update foot-gun.
export const updateProductPublicRequest = productFormRequest.extend({
  name: z.string().trim().min(1).max(255).describe("Product name."),
})

// Meta Catalog. The stored rows carry the workspace's encrypted Meta credential
// and internal lease/handle bookkeeping; the public resources omit those named
// columns. A column added to the model later is exposed unless omitted here, so
// `meta-catalog-public-schema` tests pin the exact public keys.
export const metaCatalogConnectionPublicResource = createSelectSchema(
  integrationMetaCatalogModel,
  {
    id: z.string(),
    workspaceId: z.string(),
    integrationId: z.string(),
  },
).omit({
  encryptedAuth: true,
  integrationId: true,
  workspaceId: true,
  deletedAt: true,
})

export const metaCatalogSyncRunPublicResource = createSelectSchema(
  metaCatalogSyncRunModel,
  {
    id: z.string(),
    workspaceId: z.string(),
    integrationMetaCatalogId: z.string(),
  },
).omit({
  workspaceId: true,
  handles: true,
  submissionLeaseId: true,
})

export const metaCatalogStatePublicResponse = z.object({
  connection: metaCatalogConnectionPublicResource.nullable(),
  history: z.array(metaCatalogSyncRunPublicResource),
})

export const selectMetaCatalogPublicRequest = z.object({
  catalogId: z
    .string()
    .trim()
    .regex(/^\d+$/)
    .describe("Meta catalog id to bind and import products from."),
})

export const createMetaCatalogPublicRequest = z.object({
  businessId: z
    .string()
    .trim()
    .regex(/^\d+$/)
    .describe("Business Manager id from `products.listMetaCatalogBusinesses`."),
  name: z.string().trim().min(1).max(100).describe("Catalog name."),
})

export const syncMetaCatalogPublicRequest = z
  .object({
    scope: metaCatalogSyncScopes.describe(
      "`all` products, one `category` (needs `categoryId`) or `selected` products (needs `selectedProductIds`).",
    ),
    catalogId: z
      .string()
      .trim()
      .regex(/^\d+$/)
      .describe(
        "Destination Meta catalog id; rebinds the connection if it differs.",
      ),
    categoryId: zodBigintAsString()
      .optional()
      .describe("Product category id, for scope `category`."),
    selectedProductIds: z
      .array(zodBigintAsString())
      .max(1000)
      .optional()
      .describe("Product ids, for scope `selected`; up to 1000."),
  })
  .refine(isMetaCatalogSyncScopeComplete, {
    path: ["scope"],
    message: "The scope needs its categoryId or selectedProductIds",
  })

export const metaCatalogBusinessesPublicResponse = z.array(
  z.object({ id: z.string(), name: z.string().nullish() }),
)
