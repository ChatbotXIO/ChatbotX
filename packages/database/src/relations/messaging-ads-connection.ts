import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const messagingAdsConnectionRelations = defineRelationsPart(
  schema,
  (r) => ({
    messagingAdsConnectionModel: {
      workspace: r.one.workspaceModel({
        from: r.messagingAdsConnectionModel.workspaceId,
        to: r.workspaceModel.id,
        optional: false,
      }),
      integrationWhatsapp: r.one.integrationWhatsappModel({
        from: r.messagingAdsConnectionModel.integrationWhatsappId,
        to: r.integrationWhatsappModel.id,
      }),
      integrationMessenger: r.one.integrationMessengerModel({
        from: r.messagingAdsConnectionModel.integrationMessengerId,
        to: r.integrationMessengerModel.id,
      }),
      integrationInstagram: r.one.integrationInstagramModel({
        from: r.messagingAdsConnectionModel.integrationInstagramId,
        to: r.integrationInstagramModel.id,
      }),
    },
  }),
)
