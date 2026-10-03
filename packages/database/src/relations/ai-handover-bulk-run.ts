import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const aiHandoverBulkRunRelations = defineRelationsPart(schema, (r) => ({
  aiHandoverBulkRunModel: {
    workspace: r.one.workspaceModel({
      from: r.aiHandoverBulkRunModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
    inbox: r.one.inboxModel({
      from: r.aiHandoverBulkRunModel.inboxId,
      to: r.inboxModel.id,
      optional: false,
    }),
    requestedBy: r.one.userModel({
      from: r.aiHandoverBulkRunModel.requestedByUserId,
      to: r.userModel.id,
    }),
  },
}))
