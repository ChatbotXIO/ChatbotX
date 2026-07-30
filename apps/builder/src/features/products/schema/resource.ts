import { inventoryPolicyTypes } from "@chatbotx.io/database/partials"
import { createSelectSchema, productModel } from "@chatbotx.io/database/schema"
import type {
  ProductAddonModel,
  ProductVariantModel,
  ProductVariantOptionModel,
} from "@chatbotx.io/database/types"
import z from "zod"

export const productResource = createSelectSchema(productModel, {
  id: z.string(),
  workspaceId: z.string(),
  categoryId: z.string().nullable(),
  subcategoryId: z.string().nullable(),
  images: z.array(
    z.object({ url: z.string(), type: z.enum(["link", "file"]) }),
  ),
  tags: z.array(z.string()),
  inventoryPolicy: inventoryPolicyTypes,
  // Resolved names, alongside the ids above: the table renders them directly.
}).extend({
  category: z.string().nullable(),
  subcategory: z.string().nullable(),
})
export type ProductResource = z.infer<typeof productResource>

export const productFormOptionsResource = z.object({
  products: z.array(z.object({ id: z.string(), name: z.string() })),
  vendors: z.array(z.string()),
})

export type ProductDetailResource = ProductResource & {
  variantOptions: ProductVariantOptionModel[]
  variants: ProductVariantModel[]
  addons: ProductAddonModel[]
}
