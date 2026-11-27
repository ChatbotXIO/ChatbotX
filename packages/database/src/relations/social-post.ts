import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const socialPostRelations = defineRelationsPart(schema, (r) => ({
  socialPostModel: {
    workspace: r.one.workspaceModel({
      from: r.socialPostModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
    createdBy: r.one.userModel({
      from: r.socialPostModel.createdById,
      to: r.userModel.id,
    }),
    targets: r.many.socialPostTargetModel({
      from: r.socialPostModel.id,
      to: r.socialPostTargetModel.socialPostId,
    }),
    media: r.many.socialPostMediaModel({
      from: r.socialPostModel.id,
      to: r.socialPostMediaModel.socialPostId,
    }),
  },
  socialPostTargetModel: {
    socialPost: r.one.socialPostModel({
      from: r.socialPostTargetModel.socialPostId,
      to: r.socialPostModel.id,
      optional: false,
    }),
    destination: r.one.publishDestinationModel({
      from: r.socialPostTargetModel.publishDestinationId,
      to: r.publishDestinationModel.id,
      optional: false,
    }),
    media: r.many.socialPostTargetMediaModel({
      from: r.socialPostTargetModel.id,
      to: r.socialPostTargetMediaModel.socialPostTargetId,
    }),
    parts: r.many.socialPostTargetPartModel({
      from: r.socialPostTargetModel.id,
      to: r.socialPostTargetPartModel.socialPostTargetId,
    }),
  },
  socialPostTargetPartModel: {
    target: r.one.socialPostTargetModel({
      from: r.socialPostTargetPartModel.socialPostTargetId,
      to: r.socialPostTargetModel.id,
      optional: false,
    }),
  },
  socialPostMediaModel: {
    socialPost: r.one.socialPostModel({
      from: r.socialPostMediaModel.socialPostId,
      to: r.socialPostModel.id,
      optional: false,
    }),
  },
  socialPostTargetMediaModel: {
    target: r.one.socialPostTargetModel({
      from: r.socialPostTargetMediaModel.socialPostTargetId,
      to: r.socialPostTargetModel.id,
      optional: false,
    }),
  },
}))
