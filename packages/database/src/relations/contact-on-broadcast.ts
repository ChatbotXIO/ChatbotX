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
      contactInbox: r.one.contactInboxModel({
        from: r.contactsOnBroadcastsModel.contactInboxId,
        to: r.contactInboxModel.id,
        optional: false,
      }),
      conversation: r.one.conversationModel({
        from: r.contactsOnBroadcastsModel.conversationId,
        to: r.conversationModel.id,
        optional: false,
      }),
    },
  }),
)
