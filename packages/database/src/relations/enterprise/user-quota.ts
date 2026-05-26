import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../../schema"

export const userQuotaRelations = defineRelationsPart(schema, (r) => ({
  userQuotaModel: {
    user: r.one.userModel({
      from: r.userQuotaModel.userId,
      to: r.userModel.id,
    }),
  },
}))
