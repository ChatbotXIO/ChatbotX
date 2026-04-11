import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const integrationEmailRelations = defineRelationsPart(schema, (r) => ({
  integrationEmailModel: {
    workspace: r.one.workspaceModel({
      from: r.integrationEmailModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
    inbox: r.one.inboxModel({
      from: r.integrationEmailModel.inboxId,
      to: r.inboxModel.id,
      optional: false,
    }),
    flow: r.one.flowModel({
      from: r.integrationEmailModel.welcomeFlowId,
      to: r.flowModel.id,
    }),
  },
}))
