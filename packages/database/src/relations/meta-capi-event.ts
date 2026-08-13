import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const metaCapiEventRelations = defineRelationsPart(schema, (r) => ({
  metaCapiEventModel: {
    workspace: r.one.workspaceModel({
      from: r.metaCapiEventModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
    contactInbox: r.one.contactInboxModel({
      from: r.metaCapiEventModel.contactInboxId,
      to: r.contactInboxModel.id,
      optional: false,
    }),
  },
}))
