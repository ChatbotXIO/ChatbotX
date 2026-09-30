import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const channelPostRelations = defineRelationsPart(schema, (r) => ({
  channelPostModel: {
    workspace: r.one.workspaceModel({
      from: r.channelPostModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
    inbox: r.one.inboxModel({
      from: r.channelPostModel.inboxId,
      to: r.inboxModel.id,
      optional: false,
    }),
  },
}))
