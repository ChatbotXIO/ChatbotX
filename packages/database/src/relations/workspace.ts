import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const workspaceRelations = defineRelationsPart(schema, (r) => ({
  workspaceModel: {
    owner: r.one.userModel({
      from: r.workspaceModel.ownerId,
      to: r.userModel.id,
    }),
    tenant: r.one.tenantModel({
      from: r.workspaceModel.tenantId,
      to: r.tenantModel.id,
    }),
    savedReplies: r.many.savedReplyModel({
      from: r.workspaceModel.id,
      to: r.savedReplyModel.workspaceId,
    }),
    magicLinks: r.many.magicLinkModel({
      from: r.workspaceModel.id,
      to: r.magicLinkModel.workspaceId,
    }),
  },
}))
