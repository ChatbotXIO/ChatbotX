import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const oauthClientRelations = defineRelationsPart(schema, (r) => ({
  oauthClientModel: {
    user: r.one.userModel({
      from: r.oauthClientModel.userId,
      to: r.userModel.id,
    }),
  },
}))
