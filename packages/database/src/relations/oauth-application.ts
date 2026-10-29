import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const oauthApplicationRelations = defineRelationsPart(schema, (r) => ({
  oauthApplicationModel: {
    user: r.one.userModel({
      from: r.oauthApplicationModel.userId,
      to: r.userModel.id,
    }),
  },
}))
