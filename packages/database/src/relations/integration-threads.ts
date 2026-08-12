import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const integrationThreadsRelations = defineRelationsPart(schema, (r) => ({
  integrationThreadsModel: {
    workspace: r.one.workspaceModel({
      from: r.integrationThreadsModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
    inbox: r.one.inboxModel({
      from: r.integrationThreadsModel.inboxId,
      to: r.inboxModel.id,
      optional: false,
    }),
  },
}))
