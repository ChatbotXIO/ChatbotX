import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const integrationApiRelations = defineRelationsPart(schema, (r) => ({
  integrationApiModel: {
    workspace: r.one.workspaceModel({
      from: r.integrationApiModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
    inbox: r.one.inboxModel({
      from: r.integrationApiModel.inboxId,
      to: r.inboxModel.id,
      optional: false,
    }),
  },
}))
