import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../../schema"

export const tenantRelations = defineRelationsPart(schema, (r) => ({
  tenantModel: {
    owner: r.one.userModel({
      from: r.tenantModel.ownerId,
      to: r.userModel.id,
    }),
  },
}))
