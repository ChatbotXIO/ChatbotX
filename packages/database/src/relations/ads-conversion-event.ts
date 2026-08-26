import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const adsConversionEventRelations = defineRelationsPart(schema, (r) => ({
  adsConversionEventModel: {
    workspace: r.one.workspaceModel({
      from: r.adsConversionEventModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
    integrationWhatsapp: r.one.integrationWhatsappModel({
      from: r.adsConversionEventModel.integrationWhatsappId,
      to: r.integrationWhatsappModel.id,
    }),
    integrationMessenger: r.one.integrationMessengerModel({
      from: r.adsConversionEventModel.integrationMessengerId,
      to: r.integrationMessengerModel.id,
    }),
    integrationInstagram: r.one.integrationInstagramModel({
      from: r.adsConversionEventModel.integrationInstagramId,
      to: r.integrationInstagramModel.id,
    }),
    contactInbox: r.one.contactInboxModel({
      from: r.adsConversionEventModel.contactInboxId,
      to: r.contactInboxModel.id,
    }),
  },
}))
