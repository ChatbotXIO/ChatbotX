import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const messagingAdOperationRelations = defineRelationsPart(
  schema,
  (r) => ({
    messagingAdOperationModel: {
      workspace: r.one.workspaceModel({
        from: r.messagingAdOperationModel.workspaceId,
        to: r.workspaceModel.id,
        optional: false,
      }),
      integrationWhatsapp: r.one.integrationWhatsappModel({
        from: r.messagingAdOperationModel.integrationWhatsappId,
        to: r.integrationWhatsappModel.id,
      }),
      integrationMessenger: r.one.integrationMessengerModel({
        from: r.messagingAdOperationModel.integrationMessengerId,
        to: r.integrationMessengerModel.id,
      }),
      integrationInstagram: r.one.integrationInstagramModel({
        from: r.messagingAdOperationModel.integrationInstagramId,
        to: r.integrationInstagramModel.id,
      }),
      createdByUser: r.one.userModel({
        from: r.messagingAdOperationModel.createdBy,
        to: r.userModel.id,
      }),
    },
  }),
)
