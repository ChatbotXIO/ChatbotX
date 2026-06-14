import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../../schema"

export const customDomainRelations = defineRelationsPart(schema, (r) => ({
  customDomainModel: {
    tenant: r.one.tenantModel({
      from: r.customDomainModel.tenantId,
      to: r.tenantModel.id,
    }),
  },
}))
