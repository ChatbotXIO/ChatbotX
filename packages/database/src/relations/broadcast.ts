import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const broadcastRelations = defineRelationsPart(schema, (r) => ({
  broadcastModel: {
    contactsOnBroadcasts: r.many.contactsOnBroadcastsModel({
      from: r.broadcastModel.id,
      to: r.contactsOnBroadcastsModel.broadcastId,
    }),
    contacts: r.many.contactModel({
      from: r.broadcastModel.id.through(
        r.contactsOnBroadcastsModel.broadcastId,
      ),
      to: r.contactModel.id.through(r.contactsOnBroadcastsModel.contactId),
    }),
    flow: r.one.flowModel({
      from: r.broadcastModel.flowId,
      to: r.flowModel.id,
    }),
    integrationWhatsapp: r.one.integrationWhatsappModel({
      from: r.broadcastModel.integrationWhatsappId,
      to: r.integrationWhatsappModel.id,
    }),
    integrationMessenger: r.one.integrationMessengerModel({
      from: r.broadcastModel.integrationMessengerId,
      to: r.integrationMessengerModel.id,
    }),
  },
}))
