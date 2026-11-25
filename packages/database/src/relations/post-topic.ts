import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const postTopicRelations = defineRelationsPart(schema, (r) => ({
  postTopicModel: {
    workspace: r.one.workspaceModel({
      from: r.postTopicModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
    channelPosts: r.many.channelPostModel({
      from: r.postTopicModel.id.through(
        r.channelPostToPostTopicModel.postTopicId,
      ),
      to: r.channelPostModel.id.through(
        r.channelPostToPostTopicModel.channelPostId,
      ),
    }),
  },
}))
