import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../../schema"

export const tenantHelpItemRelations = defineRelationsPart(schema, (r) => ({
  tenantHelpItemModel: {
    tenant: r.one.tenantModel({
      from: r.tenantHelpItemModel.tenantId,
      to: r.tenantModel.id,
    }),
  },
}))
