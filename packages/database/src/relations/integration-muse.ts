import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const integrationMuseRelations = defineRelationsPart(schema, (r) => ({
  integrationMuseModel: {
    integration: r.one.integrationModel({
      from: r.integrationMuseModel.integrationId,
      to: r.integrationModel.id,
    }),
  },
}))
