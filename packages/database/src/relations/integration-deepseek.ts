import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const integrationDeepseekRelations = defineRelationsPart(
  schema,
  (r) => ({
    integrationDeepseekModel: {
      integration: r.one.integrationModel({
        from: r.integrationDeepseekModel.integrationId,
        to: r.integrationModel.id,
      }),
    },
  }),
)
