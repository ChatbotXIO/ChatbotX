import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

// This retained evidence table deliberately has no foreign keys.
export const workspaceDeletionRecordRelations = defineRelationsPart(
  schema,
  () => ({ workspaceDeletionRecordModel: {} }),
)
