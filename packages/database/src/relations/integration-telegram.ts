import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const integrationTelegramRelations = defineRelationsPart(
  schema,
  (r) => ({
    integrationTelegramModel: {
      workspace: r.one.workspaceModel({
        from: r.integrationTelegramModel.workspaceId,
        to: r.workspaceModel.id,
        optional: false,
      }),
      inbox: r.one.inboxModel({
        from: r.integrationTelegramModel.inboxId,
        to: r.inboxModel.id,
        optional: false,
      }),
    },
  }),
)
