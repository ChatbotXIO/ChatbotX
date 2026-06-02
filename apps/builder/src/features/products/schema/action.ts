import { z } from "zod"

export const productFormRequest = z.object({
  name: z.string().trim().min(1).max(255).default(""),
  shortDescription: z.string().nullish().default(""),
  longDescription: z.string().max(840).nullish().default(""),
  price: z.coerce.number().min(0).default(0),
  taxes: z.coerce.number().min(0).max(100).default(0),
  discount: z.coerce.number().min(0).max(100).default(0),
  sku: z.string().nullish().default(""),
  inventoryPolicy: z.enum(["dont_track", "track"]).default("dont_track"),
  inventoryQuantity: z.coerce.number().int().min(0).default(0),
  allowOutOfStockPurchase: z.boolean().default(false),
  images: z
    .array(
      z.object({
        id: z.string().optional(),
        mode: z.enum(["link", "file"]).default("file"),
        url: z.string().default(""),
      }),
    )
    .default([]),
  variantOptions: z
    .array(
      z.object({
        name: z.string(),
        values: z.array(z.string()),
        position: z.coerce.number().default(0),
      }),
    )
    .default([]),
  variants: z
    .array(
      z.object({
        combination: z.record(z.string(), z.string()),
        price: z.coerce.number().min(0).default(0),
        isEnabled: z.boolean().default(true),
      }),
    )
    .default([]),
  addons: z
    .array(
      z.object({
        name: z.string().default(""),
        maxSelections: z.coerce.number().int().min(1).default(1),
        addonProductIds: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  tags: z.array(z.string()).default([]),
  vendor: z.string().nullish(),
  rank: z.coerce.number().int().default(10),
  category: z.string().nullish(),
  subcategory: z.string().nullish(),
  isSearchable: z.boolean().default(true),
  allowSpecialRequest: z.boolean().default(false),
  isAddonOnly: z.boolean().default(false),
})

export type ProductFormRequest = z.infer<typeof productFormRequest>

export const toggleProductActiveRequest = z.object({ isActive: z.boolean() })

export type ProductInsertData = Omit<
  ProductFormRequest,
  "variantOptions" | "variants" | "addons"
> & { workspaceId: string }

export type VariantOptionInsertData =
  ProductFormRequest["variantOptions"][number]
export type VariantInsertData = ProductFormRequest["variants"][number]
export type AddonInsertData = ProductFormRequest["addons"][number]
