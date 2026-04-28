import { defineRelationsPart } from "drizzle-orm"
import { messageShardModel, messageShardTimeRangeModel } from "./schema"

const shardSchema = {
  messageShardModel,
  messageShardTimeRangeModel,
}

export const messageShardRelations = defineRelationsPart(shardSchema, (r) => ({
  messageShardModel: {
    timeRanges: r.many.messageShardTimeRangeModel({
      from: r.messageShardModel.id,
      to: r.messageShardTimeRangeModel.shardId,
    }),
  },
  messageShardTimeRangeModel: {
    shard: r.one.messageShardModel({
      from: r.messageShardTimeRangeModel.shardId,
      to: r.messageShardModel.id,
    }),
  },
}))
