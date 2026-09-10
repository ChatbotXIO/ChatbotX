import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const messengerMessageTemplateRelations = defineRelationsPart(
  schema,
  (r) => ({
    messengerMessageTemplateModel: {
      integrationMessenger: r.one.integrationMessengerModel({
        from: r.messengerMessageTemplateModel.integrationMessengerId,
        to: r.integrationMessengerModel.id,
        optional: false,
      }),
      clonedFrom: r.one.messengerMessageTemplateModel({
        from: r.messengerMessageTemplateModel.clonedFromTemplateId,
        to: r.messengerMessageTemplateModel.id,
      }),
      clones: r.many.messengerMessageTemplateModel({
        from: r.messengerMessageTemplateModel.id,
        to: r.messengerMessageTemplateModel.clonedFromTemplateId,
      }),
    },
  }),
)
