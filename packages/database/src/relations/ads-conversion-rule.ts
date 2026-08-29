import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const adsConversionRuleRelations = defineRelationsPart(schema, (r) => ({
  adsConversionRuleModel: {
    workspace: r.one.workspaceModel({
      from: r.adsConversionRuleModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
    integrationWhatsapp: r.one.integrationWhatsappModel({
      from: r.adsConversionRuleModel.integrationWhatsappId,
      to: r.integrationWhatsappModel.id,
    }),
    integrationFacebookAds: r.one.integrationFacebookAdsModel({
      from: r.adsConversionRuleModel.integrationFacebookAdsId,
      to: r.integrationFacebookAdsModel.id,
    }),
    integrationMessenger: r.one.integrationMessengerModel({
      from: r.adsConversionRuleModel.integrationMessengerId,
      to: r.integrationMessengerModel.id,
    }),
    integrationInstagram: r.one.integrationInstagramModel({
      from: r.adsConversionRuleModel.integrationInstagramId,
      to: r.integrationInstagramModel.id,
    }),
  },
}))
