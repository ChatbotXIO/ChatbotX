import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const integrationOpenrouterRelations = defineRelationsPart(
  schema,
  (r) => ({
    integrationOpenrouterModel: {
      integration: r.one.integrationModel({
        from: r.integrationOpenrouterModel.integrationId,
        to: r.integrationModel.id,
      }),
    },
  }),
)
