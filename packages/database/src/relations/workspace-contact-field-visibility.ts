import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const workspaceContactFieldVisibilityRelations = defineRelationsPart(
  schema,
  (r) => ({
    workspaceContactFieldVisibilityModel: {
      workspace: r.one.workspaceModel({
        from: r.workspaceContactFieldVisibilityModel.workspaceId,
        to: r.workspaceModel.id,
        optional: false,
      }),
    },
  }),
)
