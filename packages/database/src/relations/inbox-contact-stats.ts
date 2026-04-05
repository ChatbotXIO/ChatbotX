import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const inboxContactStatsRelations = defineRelationsPart(schema, (r) => ({
  inboxContactStatsModel: {
    inbox: r.one.inboxModel({
      from: r.inboxContactStatsModel.inboxId,
      to: r.inboxModel.id,
    }),
  },
}))
