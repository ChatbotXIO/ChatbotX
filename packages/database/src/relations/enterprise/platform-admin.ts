import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../../schema"

export const platformAdminRelations = defineRelationsPart(schema, (r) => ({
  platformAdminModel: {
    user: r.one.userModel({
      from: r.platformAdminModel.userId,
      to: r.userModel.id,
    }),
  },
}))
