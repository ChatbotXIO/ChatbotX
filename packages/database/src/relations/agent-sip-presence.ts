import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const agentSipPresenceRelations = defineRelationsPart(schema, (r) => ({
  agentSipPresenceModel: {
    workspace: r.one.workspaceModel({
      from: r.agentSipPresenceModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
    user: r.one.userModel({
      from: r.agentSipPresenceModel.userId,
      to: r.userModel.id,
      optional: false,
    }),
  },
}))
