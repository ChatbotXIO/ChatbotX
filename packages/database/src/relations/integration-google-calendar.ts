import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const integrationGoogleCalendarRelations = defineRelationsPart(
  schema,
  (r) => ({
    integrationGoogleCalendarModel: {
      workspace: r.one.workspaceModel({
        from: r.integrationGoogleCalendarModel.workspaceId,
        to: r.workspaceModel.id,
        optional: false,
      }),
      integration: r.one.integrationModel({
        from: r.integrationGoogleCalendarModel.integrationId,
        to: r.integrationModel.id,
        optional: false,
      }),
    },
  }),
)
