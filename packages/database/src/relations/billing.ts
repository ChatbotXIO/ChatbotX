import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const billingRelations = defineRelationsPart(schema, (r) => ({
  billingModel: {
    user: r.one.userModel({
      from: r.billingModel.userId,
      to: r.userModel.id,
    }),
  },
}))
