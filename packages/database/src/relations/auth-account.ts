import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const accountRelations = defineRelationsPart(schema, (r) => ({
  accountModel: {
    user: r.one.userModel({
      from: r.accountModel.userId,
      to: r.userModel.id,
    }),
  },
}))
