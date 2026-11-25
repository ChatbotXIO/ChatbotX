import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const socialPostFeedRelations = defineRelationsPart(schema, (r) => ({
  socialPostFeedModel: {
    workspace: r.one.workspaceModel({
      from: r.socialPostFeedModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
    destinations: r.many.socialPostFeedDestinationModel({
      from: r.socialPostFeedModel.id,
      to: r.socialPostFeedDestinationModel.feedId,
    }),
    items: r.many.socialPostFeedItemModel({
      from: r.socialPostFeedModel.id,
      to: r.socialPostFeedItemModel.feedId,
    }),
  },
  socialPostFeedDestinationModel: {
    feed: r.one.socialPostFeedModel({
      from: r.socialPostFeedDestinationModel.feedId,
      to: r.socialPostFeedModel.id,
      optional: false,
    }),
    destination: r.one.publishDestinationModel({
      from: r.socialPostFeedDestinationModel.publishDestinationId,
      to: r.publishDestinationModel.id,
      optional: false,
    }),
  },
  socialPostFeedItemModel: {
    feed: r.one.socialPostFeedModel({
      from: r.socialPostFeedItemModel.feedId,
      to: r.socialPostFeedModel.id,
      optional: false,
    }),
    socialPost: r.one.socialPostModel({
      from: r.socialPostFeedItemModel.socialPostId,
      to: r.socialPostModel.id,
      optional: true,
    }),
  },
}))
