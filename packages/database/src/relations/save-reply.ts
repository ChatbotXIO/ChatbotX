import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const savedReplyRelations = defineRelationsPart(schema, (r) => ({
  savedReplyModel: {
    workspace: r.one.workspaceModel({
      from: r.savedReplyModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
  },
}))
