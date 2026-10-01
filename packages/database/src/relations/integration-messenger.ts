import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const integrationMessengerRelations = defineRelationsPart(
  schema,
  (r) => ({
    integrationMessengerModel: {
      workspace: r.one.workspaceModel({
        from: r.integrationMessengerModel.workspaceId,
        to: r.workspaceModel.id,
        optional: false,
      }),
      flow: r.one.flowModel({
        from: r.integrationMessengerModel.welcomeFlowId,
        to: r.flowModel.id,
      }),
      handoverResumeFlow: r.one.flowModel({
        from: r.integrationMessengerModel.handoverResumeFlowId,
        to: r.flowModel.id,
      }),
      inbox: r.one.inboxModel({
        from: r.integrationMessengerModel.inboxId,
        to: r.inboxModel.id,
        optional: false,
      }),
      messengerMessageTemplates: r.many.messengerMessageTemplateModel({
        from: r.integrationMessengerModel.id,
        to: r.messengerMessageTemplateModel.integrationMessengerId,
      }),
    },
  }),
)
