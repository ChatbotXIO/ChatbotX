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
    integrationWhatsapp: r.one.integrationWhatsappModel({
      from: r.broadcastModel.integrationWhatsappId,
      to: r.integrationWhatsappModel.id,
    }),
  },
}))
