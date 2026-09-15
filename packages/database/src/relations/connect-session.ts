import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const connectSessionRelations = defineRelationsPart(schema, (r) => ({
  connectSessionModel: {
    workspace: r.one.workspaceModel({
      from: r.connectSessionModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
    targetConnection: r.one.connectionModel({
      from: r.connectSessionModel.targetConnectionId,
      to: r.connectionModel.id,
      optional: true,
    }),
    actorUser: r.one.userModel({
      from: r.connectSessionModel.actorUserId,
      to: r.userModel.id,
      optional: true,
    }),
    actorToken: r.one.workspaceApiTokenModel({
      from: r.connectSessionModel.actorTokenId,
      to: r.workspaceApiTokenModel.id,
      optional: true,
    }),
  },
}))
