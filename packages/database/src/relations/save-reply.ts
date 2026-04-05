import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const savedReplyRelations = defineRelationsPart(schema, (r) => ({
  savedReplyModel: {
    user: r.one.userModel({
      from: r.savedReplyModel.userId,
      to: r.userModel.id,
      optional: false,
    }),
  },
}))
