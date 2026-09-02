import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const integrationOutlookCalendarRelations = defineRelationsPart(
  schema,
  (r) => ({
    integrationOutlookCalendarModel: {
      workspace: r.one.workspaceModel({
        from: r.integrationOutlookCalendarModel.workspaceId,
        to: r.workspaceModel.id,
        optional: false,
      }),
      integration: r.one.integrationModel({
        from: r.integrationOutlookCalendarModel.integrationId,
        to: r.integrationModel.id,
        optional: false,
      }),
    },
  }),
)
