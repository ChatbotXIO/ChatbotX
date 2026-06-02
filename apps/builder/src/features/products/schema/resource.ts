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
  images: z.array(
    z.object({ url: z.string(), type: z.enum(["link", "file"]) }),
  ),
  tags: z.array(z.string()),
  inventoryPolicy: inventoryPolicyTypes,
})
export type ProductResource = z.infer<typeof productResource>

export type ProductDetailResource = ProductResource & {
  variantOptions: ProductVariantOptionModel[]
  variants: ProductVariantModel[]
  addons: ProductAddonModel[]
}
