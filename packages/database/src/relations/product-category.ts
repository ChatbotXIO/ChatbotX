import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const productCategoryRelations = defineRelationsPart(schema, (r) => ({
  productCategoryModel: {
    workspace: r.one.workspaceModel({
      from: r.productCategoryModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
    products: r.many.productModel({
      from: r.productCategoryModel.id,
      to: r.productModel.categoryId,
    }),
    parent: r.one.productCategoryModel({
      from: r.productCategoryModel.parentId,
      to: r.productCategoryModel.id,
    }),
    children: r.many.productCategoryModel({
      from: r.productCategoryModel.id,
      to: r.productCategoryModel.parentId,
    }),
  },
}))
