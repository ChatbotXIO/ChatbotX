import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const connectionRelations = defineRelationsPart(schema, (r) => ({
  connectionModel: {
    workspace: r.one.workspaceModel({
      from: r.connectionModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
    inbox: r.one.inboxModel({
      from: r.connectionModel.inboxId,
      to: r.inboxModel.id,
      optional: true,
    }),
    integration: r.one.integrationModel({
      from: r.connectionModel.integrationId,
      to: r.integrationModel.id,
      optional: true,
    }),
    createdByUser: r.one.userModel({
      from: r.connectionModel.createdBy,
      to: r.userModel.id,
      optional: true,
    }),
  },
}))
