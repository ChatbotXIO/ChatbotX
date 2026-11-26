import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const inboxTranslationSettingsRelations = defineRelationsPart(
  schema,
  (r) => ({
    inboxTranslationSettingsModel: {
      workspace: r.one.workspaceModel({
        from: r.inboxTranslationSettingsModel.workspaceId,
        to: r.workspaceModel.id,
        optional: false,
      }),
    },
  }),
)
