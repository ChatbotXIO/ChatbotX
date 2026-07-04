import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const integrationOpenaiCompatibleRelations = defineRelationsPart(
  schema,
  (r) => ({
    integrationOpenaiCompatibleModel: {
      integration: r.one.integrationModel({
        from: r.integrationOpenaiCompatibleModel.integrationId,
        to: r.integrationModel.id,
      }),
    },
  }),
)
