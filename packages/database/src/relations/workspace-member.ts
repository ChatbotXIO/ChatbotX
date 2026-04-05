import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const workspaceMemberRelations = defineRelationsPart(schema, (r) => ({
  workspaceMemberModel: {
    workspace: r.one.workspaceModel({
      from: r.workspaceMemberModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
    user: r.one.userModel({
      from: r.workspaceMemberModel.userId,
      to: r.userModel.id,
      optional: false,
    }),
  },
}))
