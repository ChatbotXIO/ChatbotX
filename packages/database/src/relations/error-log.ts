import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const errorLogRelations = defineRelationsPart(schema, (r) => ({
  errorLogModel: {
    workspace: r.one.workspaceModel({
      from: r.errorLogModel.workspaceId,
      to: r.workspaceModel.id,
    }),
    contact: r.one.contactModel({
      from: r.errorLogModel.contactId,
      to: r.contactModel.id,
    }),
  },
}))
