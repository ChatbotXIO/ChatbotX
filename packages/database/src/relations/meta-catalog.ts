import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const metaCatalogRelations = defineRelationsPart(schema, (r) => ({
  integrationMetaCatalogModel: {
    workspace: r.one.workspaceModel({
      from: r.integrationMetaCatalogModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
    integration: r.one.integrationModel({
      from: r.integrationMetaCatalogModel.integrationId,
      to: r.integrationModel.id,
      optional: false,
    }),
    items: r.many.metaCatalogItemModel({
      from: r.integrationMetaCatalogModel.id,
      to: r.metaCatalogItemModel.integrationMetaCatalogId,
    }),
    syncRuns: r.many.metaCatalogSyncRunModel({
      from: r.integrationMetaCatalogModel.id,
      to: r.metaCatalogSyncRunModel.integrationMetaCatalogId,
    }),
  },
  metaCatalogItemModel: {
    integration: r.one.integrationMetaCatalogModel({
      from: r.metaCatalogItemModel.integrationMetaCatalogId,
      to: r.integrationMetaCatalogModel.id,
      optional: false,
    }),
    product: r.one.productModel({
      from: r.metaCatalogItemModel.productId,
      to: r.productModel.id,
      optional: false,
    }),
  },
  metaCatalogSyncRunModel: {
    integration: r.one.integrationMetaCatalogModel({
      from: r.metaCatalogSyncRunModel.integrationMetaCatalogId,
      to: r.integrationMetaCatalogModel.id,
      optional: false,
    }),
    workspace: r.one.workspaceModel({
      from: r.metaCatalogSyncRunModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
  },
}))
