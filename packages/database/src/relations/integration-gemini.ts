import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const integrationGeminiRelations = defineRelationsPart(schema, (r) => ({
  integrationGeminiModel: {
    integration: r.one.integrationModel({
      from: r.integrationGeminiModel.integrationId,
      to: r.integrationModel.id,
    }),
  },
}))
