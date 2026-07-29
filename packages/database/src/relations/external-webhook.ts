import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const externalWebhookRelations = defineRelationsPart(schema, (r) => ({
  externalWebhookModel: {
    workspace: r.one.workspaceModel({
      from: r.externalWebhookModel.workspaceId,
      to: r.workspaceModel.id,
    }),
  },
}))
