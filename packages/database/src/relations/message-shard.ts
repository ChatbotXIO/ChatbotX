import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const messageShardRelations = defineRelationsPart(schema, (r) => ({
  messageShardModel: {
    timeRanges: r.many.shardTimeRangeModel({
      from: r.messageShardModel.id,
      to: r.shardTimeRangeModel.shardId,
    }),
  },
  shardTimeRangeModel: {
    shard: r.one.messageShardModel({
      from: r.shardTimeRangeModel.shardId,
      to: r.messageShardModel.id,
    }),
  },
}))
