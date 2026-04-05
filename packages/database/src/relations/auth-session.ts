import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const sessionRelations = defineRelationsPart(schema, (r) => ({
  sessionModel: {
    user: r.one.userModel({
      from: r.sessionModel.userId,
      to: r.userModel.id,
    }),
  },
}))
