import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const socialPostSnippetRelations = defineRelationsPart(schema, (r) => ({
  socialPostSnippetModel: {
    workspace: r.one.workspaceModel({
      from: r.socialPostSnippetModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
  },
}))
