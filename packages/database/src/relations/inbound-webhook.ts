import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const inboundWebhookRelations = defineRelationsPart(schema, (r) => ({
  inboundWebhookModel: {
    workspace: r.one.workspaceModel({
      from: r.inboundWebhookModel.workspaceId,
      to: r.workspaceModel.id,
    }),
    requests: r.many.inboundWebhookRequestModel({
      from: r.inboundWebhookModel.id,
      to: r.inboundWebhookRequestModel.inboundWebhookId,
    }),
  },
  inboundWebhookRequestModel: {
    inboundWebhook: r.one.inboundWebhookModel({
      from: r.inboundWebhookRequestModel.inboundWebhookId,
      to: r.inboundWebhookModel.id,
    }),
    inbox: r.one.inboxModel({
      from: r.inboundWebhookRequestModel.inboxId,
      to: r.inboxModel.id,
    }),
    contact: r.one.contactModel({
      from: r.inboundWebhookRequestModel.contactId,
      to: r.contactModel.id,
    }),
  },
}))
