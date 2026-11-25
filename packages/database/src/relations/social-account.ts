import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const socialAccountRelations = defineRelationsPart(schema, (r) => ({
  socialAccountModel: {
    workspace: r.one.workspaceModel({
      from: r.socialAccountModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
    connectedBy: r.one.userModel({
      from: r.socialAccountModel.connectedById,
      to: r.userModel.id,
    }),
    destinations: r.many.socialAccountDestinationModel({
      from: r.socialAccountModel.id,
      to: r.socialAccountDestinationModel.socialAccountId,
    }),
  },
  socialAccountDestinationModel: {
    socialAccount: r.one.socialAccountModel({
      from: r.socialAccountDestinationModel.socialAccountId,
      to: r.socialAccountModel.id,
      optional: false,
    }),
    workspace: r.one.workspaceModel({
      from: r.socialAccountDestinationModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
  },
}))
