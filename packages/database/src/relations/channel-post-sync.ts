import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const channelPostSyncRelations = defineRelationsPart(schema, (r) => ({
  channelPostSyncModel: {
    workspace: r.one.workspaceModel({
      from: r.channelPostSyncModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
    inbox: r.one.inboxModel({
      from: r.channelPostSyncModel.inboxId,
      to: r.inboxModel.id,
      optional: false,
    }),
  },
}))
