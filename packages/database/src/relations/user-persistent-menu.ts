import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const userPersistentMenuRelations = defineRelationsPart(schema, (r) => ({
  userPersistentMenuModel: {
    workspace: r.one.workspaceModel({
      from: r.userPersistentMenuModel.workspaceId,
      to: r.workspaceModel.id,
    }),
  },
}))
