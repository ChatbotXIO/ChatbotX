import { index, pgTable, timestamp } from "drizzle-orm/pg-core"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { messageShardModel } from "./message-shard"

export const shardTimeRangeModel = pgTable(
  "ShardTimeRange",
  {
    ...sharedColumns,
    shardId: bigintAsString()
      .notNull()
      .references(() => messageShardModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    startTime: timestamp(timestampConfig).notNull(),
    endTime: timestamp(timestampConfig),
  },
  (table) => [
    index("ShardTimeRange_time_lookup_idx").using(
      "btree",
      table.startTime.asc().nullsLast(),
      table.endTime.asc().nullsLast(),
    ),
    index("ShardTimeRange_shardId_idx").using(
      "btree",
      table.shardId.asc().nullsLast(),
    ),
  ],
)
