import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const fileRelations = defineRelationsPart(schema, (r) => ({
  fileModel: {
    workspace: r.one.workspaceModel({
      from: r.fileModel.workspaceId,
      to: r.workspaceModel.id,
    }),
    user: r.one.userModel({
      from: r.fileModel.userId,
      to: r.userModel.id,
    }),
    imports: r.many.importModel({
      from: r.fileModel.id,
      to: r.importModel.fileId,
    }),
  },
}))
