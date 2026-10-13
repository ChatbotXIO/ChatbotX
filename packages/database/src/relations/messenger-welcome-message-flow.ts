import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const messengerWelcomeMessageFlowRelations = defineRelationsPart(
  schema,
  (r) => ({
    messengerWelcomeMessageFlowModel: {
      integrationMessenger: r.one.integrationMessengerModel({
        from: r.messengerWelcomeMessageFlowModel.integrationMessengerId,
        to: r.integrationMessengerModel.id,
        optional: false,
      }),
    },
  }),
)
