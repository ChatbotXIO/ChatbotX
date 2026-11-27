import { sql } from "drizzle-orm"
import {
  check,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { workspaceModel } from "./workspace"

/** Groups a workspace's business locations for the Places Near Me tool. */
export const placeCategoryModel = pgTable(
  "PlaceCategory",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    name: text().notNull(),
    /** Lower number = higher priority. */
    rank: integer().default(10).notNull(),
  },
  (table) => [
    index("PlaceCategory_workspaceId_idx").on(table.workspaceId),
    // Case-insensitive, so "Cafe" and "cafe" cannot coexist in a workspace.
    uniqueIndex("PlaceCategory_workspaceId_name_key").on(
      table.workspaceId,
      sql`lower(${table.name})`,
    ),
  ],
)

/** A business location a customer can be pointed to. */
export const placeLocationModel = pgTable(
  "PlaceLocation",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    name: text().notNull(),
    latitude: doublePrecision().notNull(),
    longitude: doublePrecision().notNull(),
    categoryId: bigintAsString().references(() => placeCategoryModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
  },
  (table) => [
    index("PlaceLocation_workspaceId_createdAt_idx").on(
      table.workspaceId,
      table.createdAt,
    ),
    index("PlaceLocation_categoryId_idx").on(table.categoryId),
    check(
      "PlaceLocation_latitude_check",
      sql`${table.latitude} BETWEEN -90 AND 90`,
    ),
    check(
      "PlaceLocation_longitude_check",
      sql`${table.longitude} BETWEEN -180 AND 180`,
    ),
  ],
)
