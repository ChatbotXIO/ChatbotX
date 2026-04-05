import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const integrationGoogleSheetsRelations = defineRelationsPart(
  schema,
  (r) => ({
    integrationGoogleSheetsModel: {
      integration: r.one.integrationModel({
        from: r.integrationGoogleSheetsModel.integrationId,
        to: r.integrationModel.id,
      }),
    },
  }),
)
