import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const whatsappCallPermissionRelations = defineRelationsPart(
  schema,
  (r) => ({
    whatsappCallPermissionModel: {
      workspace: r.one.workspaceModel({
        from: r.whatsappCallPermissionModel.workspaceId,
        to: r.workspaceModel.id,
        optional: false,
      }),
      contactInbox: r.one.contactInboxModel({
        from: r.whatsappCallPermissionModel.contactInboxId,
        to: r.contactInboxModel.id,
        optional: false,
      }),
    },
  }),
)
