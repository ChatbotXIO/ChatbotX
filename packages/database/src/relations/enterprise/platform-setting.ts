import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../../schema"

export const platformSettingRelations = defineRelationsPart(schema, (r) => ({
  platformSettingModel: {
    user: r.one.userModel({
      from: r.platformSettingModel.userId,
      to: r.userModel.id,
    }),
  },
}))
