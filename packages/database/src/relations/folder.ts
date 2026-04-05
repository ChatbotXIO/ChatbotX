import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const folderRelations = defineRelationsPart(schema, (_r) => ({
  folderModel: {},
}))
