import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const importRelations = defineRelationsPart(schema, (r) => ({
  importModel: {
    workspace: r.one.workspaceModel({
      from: r.importModel.workspaceId,
      to: r.workspaceModel.id,
    }),
    user: r.one.userModel({
      from: r.importModel.userId,
      to: r.userModel.id,
    }),
    file: r.one.fileModel({
      from: r.importModel.fileId,
      to: r.fileModel.id,
    }),
  },
}))
