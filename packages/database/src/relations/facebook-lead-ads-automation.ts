import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const facebookLeadAdsAutomationRelations = defineRelationsPart(
  schema,
  (r) => ({
    facebookLeadAdsAutomationModel: {
      workspace: r.one.workspaceModel({
        from: r.facebookLeadAdsAutomationModel.workspaceId,
        to: r.workspaceModel.id,
        optional: false,
      }),
      flow: r.one.flowModel({
        from: r.facebookLeadAdsAutomationModel.flowId,
        to: r.flowModel.id,
      }),
      leads: r.many.facebookLeadAdsLeadModel({
        from: r.facebookLeadAdsAutomationModel.id,
        to: r.facebookLeadAdsLeadModel.automationId,
      }),
    },
  }),
)
