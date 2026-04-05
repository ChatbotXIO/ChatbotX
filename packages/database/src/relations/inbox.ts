import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const inboxRelations = defineRelationsPart(schema, (r) => ({
  inboxModel: {
    workspace: r.one.workspaceModel({
      from: r.inboxModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
    integrationMessenger: r.one.integrationMessengerModel({
      from: r.inboxModel.id,
      to: r.integrationMessengerModel.inboxId,
    }),
    integrationWebchat: r.one.integrationWebchatModel({
      from: r.inboxModel.id,
      to: r.integrationWebchatModel.inboxId,
    }),
    integrationZalo: r.one.integrationZaloModel({
      from: r.inboxModel.id,
      to: r.integrationZaloModel.inboxId,
    }),
    integrationWhatsapp: r.one.integrationWhatsappModel({
      from: r.inboxModel.id,
      to: r.integrationWhatsappModel.inboxId,
    }),
    contactInboxes: r.many.contactInboxModel({
      from: r.inboxModel.id,
      to: r.contactInboxModel.inboxId,
    }),
    contactStats: r.one.inboxContactStatsModel({
      from: r.inboxModel.id,
      to: r.inboxContactStatsModel.inboxId,
    }),
  },
}))
