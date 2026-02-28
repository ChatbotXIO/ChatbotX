import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const integrationClaudeRelations = defineRelationsPart(schema, (r) => ({
  integrationClaudeModel: {
    integration: r.one.integrationModel({
      from: r.integrationClaudeModel.integrationId,
      to: r.integrationModel.id,
    }),
  },
}))
