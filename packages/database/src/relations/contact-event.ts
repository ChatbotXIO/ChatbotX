import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const contactEventRelations = defineRelationsPart(schema, (r) => ({
  contactEventModel: {
    contact: r.one.contactModel({
      from: r.contactEventModel.contactId,
      to: r.contactModel.id,
    }),
    workspace: r.one.workspaceModel({
      from: r.contactEventModel.workspaceId,
      to: r.workspaceModel.id,
    }),
  },
}))
