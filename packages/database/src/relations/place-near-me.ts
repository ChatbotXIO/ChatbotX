import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const placeNearMeRelations = defineRelationsPart(schema, (r) => ({
  placeCategoryModel: {
    workspace: r.one.workspaceModel({
      from: r.placeCategoryModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
    locations: r.many.placeLocationModel({
      from: r.placeCategoryModel.id,
      to: r.placeLocationModel.categoryId,
    }),
  },
  placeLocationModel: {
    workspace: r.one.workspaceModel({
      from: r.placeLocationModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
    category: r.one.placeCategoryModel({
      from: r.placeLocationModel.categoryId,
      to: r.placeCategoryModel.id,
    }),
  },
}))
