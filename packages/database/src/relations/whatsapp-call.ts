import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const whatsappCallRelations = defineRelationsPart(schema, (r) => ({
  whatsappCallModel: {
    workspace: r.one.workspaceModel({
      from: r.whatsappCallModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
    inbox: r.one.inboxModel({
      from: r.whatsappCallModel.inboxId,
      to: r.inboxModel.id,
      optional: false,
    }),
    contactInbox: r.one.contactInboxModel({
      from: r.whatsappCallModel.contactInboxId,
      to: r.contactInboxModel.id,
      optional: false,
    }),
    conversation: r.one.conversationModel({
      from: r.whatsappCallModel.conversationId,
      to: r.conversationModel.id,
      optional: false,
    }),
  },
}))
