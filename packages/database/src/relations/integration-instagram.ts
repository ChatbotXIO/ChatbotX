import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const integrationInstagramRelations = defineRelationsPart(
  schema,
  (r) => ({
    integrationInstagramModel: {
      workspace: r.one.workspaceModel({
        from: r.integrationInstagramModel.workspaceId,
        to: r.workspaceModel.id,
        optional: false,
      }),
      flow: r.one.flowModel({
        from: r.integrationInstagramModel.welcomeFlowId,
        to: r.flowModel.id,
      }),
      inbox: r.one.inboxModel({
        from: r.integrationInstagramModel.inboxId,
        to: r.inboxModel.id,
        optional: false,
      }),
    },
  }),
)
