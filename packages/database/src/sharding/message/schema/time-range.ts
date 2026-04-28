import { index, pgTable, timestamp } from "drizzle-orm/pg-core"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../../../partials/shared"
import { messageShardModel } from "./shard"

export const messageShardTimeRangeModel = pgTable(
  "MessageShardTimeRange",
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
    index("MessageShardTimeRange_time_lookup_idx").using(
      "btree",
      table.startTime.asc().nullsLast(),
      table.endTime.asc().nullsLast(),
    ),
    index("MessageShardTimeRange_shardId_idx").using(
      "btree",
      table.shardId.asc().nullsLast(),
    ),
  ],
)
