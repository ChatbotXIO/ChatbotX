import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const contactInboxRelations = defineRelationsPart(schema, (r) => ({
  contactInboxModel: {
    contact: r.one.contactModel({
      from: r.contactInboxModel.contactId,
      to: r.contactModel.id,
      optional: false,
    }),
    inbox: r.one.inboxModel({
      from: r.contactInboxModel.inboxId,
      to: r.inboxModel.id,
      optional: false,
    }),
    conversation: r.one.conversationModel({
      from: r.contactInboxModel.contactId,
      to: r.conversationModel.contactId,
      optional: false,
    }),
  },
}))
