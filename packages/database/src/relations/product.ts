import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const productRelations = defineRelationsPart(schema, (r) => ({
  productModel: {
    variantOptions: r.many.productVariantOptionModel({
      from: r.productModel.id,
      to: r.productVariantOptionModel.productId,
    }),
    variants: r.many.productVariantModel({
      from: r.productModel.id,
      to: r.productVariantModel.productId,
    }),
    addons: r.many.productAddonModel({
      from: r.productModel.id,
      to: r.productAddonModel.productId,
    }),
  },
  productVariantOptionModel: {
    product: r.one.productModel({
      from: r.productVariantOptionModel.productId,
      to: r.productModel.id,
    }),
  },
  productVariantModel: {
    product: r.one.productModel({
      from: r.productVariantModel.productId,
      to: r.productModel.id,
    }),
  },
  productAddonModel: {
    product: r.one.productModel({
      from: r.productAddonModel.productId,
      to: r.productModel.id,
    }),
  },
}))
