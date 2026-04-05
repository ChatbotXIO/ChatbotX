import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const triggerContactHistoryRelations = defineRelationsPart(
  schema,
  (r) => ({
    triggerContactHistoryModel: {
      trigger: r.one.triggerModel({
        from: r.triggerContactHistoryModel.triggerId,
        to: r.triggerModel.id,
        optional: false,
      }),
      contact: r.one.contactModel({
        from: r.triggerContactHistoryModel.contactId,
        to: r.contactModel.id,
        optional: false,
      }),
      workspace: r.one.workspaceModel({
        from: r.triggerContactHistoryModel.workspaceId,
        to: r.workspaceModel.id,
        optional: false,
      }),
    },
  }),
)
