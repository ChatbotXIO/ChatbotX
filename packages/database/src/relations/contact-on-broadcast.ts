import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const contactsOnBroadcastsRelations = defineRelationsPart(
  schema,
  (r) => ({
    contactsOnBroadcastsModel: {
      broadcast: r.one.broadcastModel({
        from: r.contactsOnBroadcastsModel.broadcastId,
        to: r.broadcastModel.id,
        optional: false,
      }),
      contact: r.one.contactModel({
        from: r.contactsOnBroadcastsModel.contactId,
        to: r.contactModel.id,
        optional: false,
      }),
    },
  }),
)
