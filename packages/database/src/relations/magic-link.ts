import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const magicLinkRelations = defineRelationsPart(schema, (r) => ({
  magicLinkModel: {
    workspace: r.one.workspaceModel({
      from: r.magicLinkModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
  },
}))
