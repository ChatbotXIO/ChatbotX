import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const spreadsheetRelations = defineRelationsPart(schema, (r) => ({
  spreadsheetModel: {
    workspace: r.one.workspaceModel({
      from: r.spreadsheetModel.workspaceId,
      to: r.workspaceModel.id,
    }),
  },
}))
