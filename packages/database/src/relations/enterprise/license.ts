import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../../schema"

export const licenseRelations = defineRelationsPart(schema, (_r) => ({
  licenseModel: {},
}))
