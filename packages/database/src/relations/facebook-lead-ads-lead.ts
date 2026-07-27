import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const facebookLeadAdsLeadRelations = defineRelationsPart(
  schema,
  (r) => ({
    facebookLeadAdsLeadModel: {
      automation: r.one.facebookLeadAdsAutomationModel({
        from: r.facebookLeadAdsLeadModel.automationId,
        to: r.facebookLeadAdsAutomationModel.id,
        optional: false,
      }),
      contact: r.one.contactModel({
        from: r.facebookLeadAdsLeadModel.contactId,
        to: r.contactModel.id,
      }),
    },
  }),
)
