import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

// This retained trail table deliberately has no foreign keys.
export const resourceDeletionLogRelations = defineRelationsPart(schema, () => ({
  resourceDeletionLogModel: {},
}))
