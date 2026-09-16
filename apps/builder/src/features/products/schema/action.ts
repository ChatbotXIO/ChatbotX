import { z } from "zod"
import { DEFAULT_PRODUCT_CURRENCY } from "../constants"

const CURRENCY_CODE_LENGTH = 3

export const productFormRequest = z.object({
  name: z.string().trim().min(1).max(255).default("").describe("Product name."),
  shortDescription: z
    .string()
    .nullish()
    .default("")
    .describe("Short summary shown in listings."),
  longDescription: z
    .string()
    .max(840)
    .nullish()
    .default("")
    .describe("Full product description."),
  price: z.coerce
    .number()
    .min(0)
    .default(0)
    .describe("Base price, in the product's currency."),
  taxes: z.coerce
    .number()
    .min(0)
    .max(100)
    .default(0)
    .describe("Tax rate, as a percentage."),
  discount: z.coerce
    .number()
    .min(0)
    .max(100)
    .default(0)
    .describe("Discount rate, as a percentage."),
  currency: z
    .string()
    .trim()
    .length(CURRENCY_CODE_LENGTH)
    .default(DEFAULT_PRODUCT_CURRENCY)
    .describe("ISO 4217 currency code."),
  productUrl: z
    .union([z.url(), z.literal("")])
    .nullish()
    .default("")
    .describe("External product page URL, if any."),
  sku: z.string().nullish().default("").describe("Stock keeping unit code."),
  inventoryPolicy: z
    .enum(["dont_track", "track"])
    .default("dont_track")
    .describe("Whether inventoryQuantity is tracked and enforced."),
  inventoryQuantity: z.coerce
    .number()
    .int()
    .min(0)
    .default(0)
    .describe("Units in stock, used when inventoryPolicy is `track`."),
  allowOutOfStockPurchase: z
    .boolean()
    .default(false)
    .describe("Whether the product can still be purchased once out of stock."),
  images: z
    .array(
      z.object({
        id: z.string().optional(),
        mode: z.enum(["link", "file"]).default("file"),
        url: z.string().default(""),
      }),
    )
    .default([])
    .describe("Product images, each a link or an uploaded file."),
  variantOptions: z
    .array(
      z.object({
        name: z.string(),
        values: z.array(z.string()),
        position: z.coerce.number().default(0),
      }),
    )
    .default([])
    .describe("Option axes (e.g. size, color) used to generate variants."),
  variants: z
    .array(
      z.object({
        combination: z.record(z.string(), z.string()),
        price: z.coerce.number().min(0).default(0),
        isEnabled: z.boolean().default(true),
      }),
    )
    .default([])
    .describe(
      "Purchasable combinations of variantOptions, each with its own price.",
    ),
  addons: z
    .array(
      z.object({
        name: z.string().default(""),
        maxSelections: z.coerce.number().int().min(1).default(1),
        addonProductIds: z.array(z.string()).default([]),
      }),
    )
    .default([])
    .describe("Optional add-on groups offered alongside the product."),
  tags: z
    .array(z.string())
    .default([])
    .describe("Freeform labels for filtering/search."),
  vendor: z.string().nullish().describe("Vendor or brand name."),
  rank: z.coerce
    .number()
    .int()
    .default(10)
    .describe("Sort order among products."),
  categoryId: z
    .string()
    .regex(/^\d+$/)
    .nullish()
    .describe("Category id. Get it from `productCategories.list`."),
  subcategoryId: z
    .string()
    .regex(/^\d+$/)
    .nullish()
    .describe("Sub-category id, must be a child of categoryId."),
  isSearchable: z
    .boolean()
    .default(true)
    .describe("Whether the product appears in search/listing."),
  allowSpecialRequest: z
    .boolean()
    .default(false)
    .describe(
      "Whether customers can attach a special request note when ordering.",
    ),
  isAddonOnly: z
    .boolean()
    .default(false)
    .describe(
      "Whether the product is only purchasable as an addon to another product.",
    ),
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
