import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const flowNodeStatRelations = defineRelationsPart(schema, (r) => ({
  flowNodeStatModel: {
    workspace: r.one.workspaceModel({
      from: r.flowNodeStatModel.workspaceId,
      to: r.workspaceModel.id,
    }),
    contact: r.one.contactModel({
      from: r.flowNodeStatModel.contactId,
      to: r.contactModel.id,
    }),
    contactInbox: r.one.contactInboxModel({
      from: r.flowNodeStatModel.contactInboxId,
      to: r.contactInboxModel.id,
    }),
    flow: r.one.flowModel({
      from: r.flowNodeStatModel.flowId,
      to: r.flowModel.id,
    }),
    analytics: r.one.flowAnalyticsSessionModel({
      from: r.flowNodeStatModel.analyticsId,
      to: r.flowAnalyticsSessionModel.id,
    }),
  },
}))
