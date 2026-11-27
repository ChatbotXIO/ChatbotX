import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const integrationLineRelations = defineRelationsPart(schema, (r) => ({
  integrationLineModel: {
    workspace: r.one.workspaceModel({
      from: r.integrationLineModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
    inbox: r.one.inboxModel({
      from: r.integrationLineModel.inboxId,
      to: r.inboxModel.id,
      optional: false,
    }),
  },
}))
