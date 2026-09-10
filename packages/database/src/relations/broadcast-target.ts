import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const broadcastTargetRelations = defineRelationsPart(schema, (r) => ({
  broadcastTargetModel: {
    broadcast: r.one.broadcastModel({
      from: r.broadcastTargetModel.broadcastId,
      to: r.broadcastModel.id,
      optional: false,
    }),
    inbox: r.one.inboxModel({
      from: r.broadcastTargetModel.inboxId,
      to: r.inboxModel.id,
      optional: false,
    }),
    flow: r.one.flowModel({
      from: r.broadcastTargetModel.flowId,
      to: r.flowModel.id,
    }),
  },
}))
