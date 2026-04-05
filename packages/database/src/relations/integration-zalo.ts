import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const integrationZaloRelations = defineRelationsPart(schema, (r) => ({
  integrationZaloModel: {
    workspace: r.one.workspaceModel({
      from: r.integrationZaloModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
    flow: r.one.flowModel({
      from: r.integrationZaloModel.fallbackFlowId,
      to: r.flowModel.id,
    }),
    inbox: r.one.inboxModel({
      from: r.integrationZaloModel.inboxId,
      to: r.inboxModel.id,
      optional: false,
    }),
  },
}))
