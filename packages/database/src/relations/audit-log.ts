import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const auditLogRelations = defineRelationsPart(schema, (r) => ({
  auditLogModel: {
    workspace: r.one.workspaceModel({
      from: r.auditLogModel.workspaceId,
      to: r.workspaceModel.id,
    }),
    user: r.one.userModel({
      from: r.auditLogModel.userId,
      to: r.userModel.id,
    }),
  },
}))
