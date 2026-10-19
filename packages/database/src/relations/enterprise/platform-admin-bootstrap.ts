import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../../schema"

export const platformAdminBootstrapRelations = defineRelationsPart(
  schema,
  (_r) => ({
    platformAdminBootstrapModel: {},
  }),
)
