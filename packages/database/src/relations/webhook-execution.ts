import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const webhookExecutionRelations = defineRelationsPart(schema, (r) => ({
  webhookExecutionModel: {
    webhook: r.one.webhookModel({
      from: r.webhookExecutionModel.webhookId,
      to: r.webhookModel.id,
      optional: false,
    }),
    contact: r.one.contactModel({
      from: r.webhookExecutionModel.contactId,
      to: r.contactModel.id,
      optional: false,
    }),
    workspace: r.one.workspaceModel({
      from: r.webhookExecutionModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
  },
}))
