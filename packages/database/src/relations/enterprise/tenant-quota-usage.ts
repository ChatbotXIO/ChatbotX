import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../../schema"

export const tenantQuotaUsageRelations = defineRelationsPart(schema, (r) => ({
  tenantQuotaUsageModel: {
    tenant: r.one.tenantModel({
      from: r.tenantQuotaUsageModel.tenantId,
      to: r.tenantModel.id,
    }),
  },
}))
