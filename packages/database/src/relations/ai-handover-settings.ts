import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const aiHandoverSettingsRelations = defineRelationsPart(schema, (r) => ({
  aiHandoverSettingsModel: {
    workspace: r.one.workspaceModel({
      from: r.aiHandoverSettingsModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
    inbox: r.one.inboxModel({
      from: r.aiHandoverSettingsModel.inboxId,
      to: r.inboxModel.id,
      optional: false,
    }),
    gotoFlow: r.one.flowModel({
      from: r.aiHandoverSettingsModel.gotoFlowId,
      to: r.flowModel.id,
    }),
  },
}))
