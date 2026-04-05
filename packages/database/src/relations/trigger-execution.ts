import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const triggerExecutionRelations = defineRelationsPart(schema, (r) => ({
  triggerExecutionModel: {
    trigger: r.one.triggerModel({
      from: r.triggerExecutionModel.triggerId,
      to: r.triggerModel.id,
      optional: false,
    }),
    contact: r.one.contactModel({
      from: r.triggerExecutionModel.contactId,
      to: r.contactModel.id,
      optional: false,
    }),
    workspace: r.one.workspaceModel({
      from: r.triggerExecutionModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
  },
}))
