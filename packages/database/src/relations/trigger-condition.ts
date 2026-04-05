import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const conditionRelations = defineRelationsPart(schema, (r) => ({
  conditionModel: {
    trigger: r.one.triggerModel({
      from: r.conditionModel.triggerId,
      to: r.triggerModel.id,
    }),
    webhook: r.one.webhookModel({
      from: r.conditionModel.webhookId,
      to: r.webhookModel.id,
    }),
  },
}))
