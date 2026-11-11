import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const templateStoreRelations = defineRelationsPart(schema, (r) => ({
  templateStoreCategoryModel: {
    tenant: r.one.tenantModel({
      from: r.templateStoreCategoryModel.tenantId,
      to: r.tenantModel.id,
      optional: false,
    }),
    listingLinks: r.many.templateStoreListingCategoryModel({
      from: r.templateStoreCategoryModel.id,
      to: r.templateStoreListingCategoryModel.categoryId,
    }),
  },
  templateStoreListingModel: {
    tenant: r.one.tenantModel({
      from: r.templateStoreListingModel.tenantId,
      to: r.tenantModel.id,
      optional: false,
    }),
    template: r.one.templateModel({
      from: r.templateStoreListingModel.templateId,
      to: r.templateModel.id,
      optional: false,
    }),
    categoryLinks: r.many.templateStoreListingCategoryModel({
      from: r.templateStoreListingModel.id,
      to: r.templateStoreListingCategoryModel.listingId,
    }),
  },
  templateStoreListingCategoryModel: {
    listing: r.one.templateStoreListingModel({
      from: r.templateStoreListingCategoryModel.listingId,
      to: r.templateStoreListingModel.id,
      optional: false,
    }),
    category: r.one.templateStoreCategoryModel({
      from: r.templateStoreListingCategoryModel.categoryId,
      to: r.templateStoreCategoryModel.id,
      optional: false,
    }),
  },
}))
