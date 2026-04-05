import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const planRelations = defineRelationsPart(schema, (_r) => ({
  planModel: {},
}))
