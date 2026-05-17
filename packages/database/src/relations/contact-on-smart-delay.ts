import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const contactOnSmartDelayRelations = defineRelationsPart(
  schema,
  (r) => ({
    contactOnSmartDelayModel: {
      workspace: r.one.workspaceModel({
        from: r.contactOnSmartDelayModel.workspaceId,
        to: r.workspaceModel.id,
        optional: false,
      }),
    },
  }),
)
