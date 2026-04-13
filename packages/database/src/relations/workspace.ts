import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const workspaceRelations = defineRelationsPart(schema, (r) => ({
  workspaceModel: {
    organization: r.one.organizationModel({
      from: r.workspaceModel.organizationId,
      to: r.organizationModel.id,
    }),
    workspaceUsage: r.one.workspaceUsageModel({
      from: r.workspaceModel.id,
      to: r.workspaceUsageModel.workspaceId,
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
