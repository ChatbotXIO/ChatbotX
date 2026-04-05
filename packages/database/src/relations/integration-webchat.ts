import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const integrationWebchatRelations = defineRelationsPart(schema, (r) => ({
  integrationWebchatModel: {
    workspace: r.one.workspaceModel({
      from: r.integrationWebchatModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
    inbox: r.one.inboxModel({
      from: r.integrationWebchatModel.inboxId,
      to: r.inboxModel.id,
      optional: false,
    }),
    flow: r.one.flowModel({
      from: r.integrationWebchatModel.welcomeFlowId,
      to: r.flowModel.id,
    }),
  },
}))
