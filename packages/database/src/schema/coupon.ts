import { sql } from "drizzle-orm"
import {
  boolean,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { type CouponTopicStatus, couponTopicStatuses } from "../partials/coupon"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { userModel } from "./auth-user"
import { contactModel } from "./contact"
import { workspaceModel } from "./workspace"

export const couponTopicStatus = pgEnum(
  "couponTopicStatus",
  couponTopicStatuses.options as [CouponTopicStatus, ...CouponTopicStatus[]],
)

export const couponTopicModel = pgTable(
  "CouponTopic",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    name: text().notNull(),
    description: text(),
    expiresAt: timestamp(timestampConfig),
    status: couponTopicStatus()
      .default(couponTopicStatuses.enum.active)
      .notNull(),
    deletedAt: timestamp(timestampConfig),
    hasEverHadCoupon: boolean().default(false).notNull(),
    createdById: bigintAsString().references(() => userModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
  },
  (table) => [
    index("CouponTopic_workspaceId_status_deletedAt_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
      table.status.asc().nullsLast(),
      table.deletedAt.asc().nullsLast(),
    ),
    index("CouponTopic_workspaceId_expiresAt_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
      table.expiresAt.asc().nullsLast(),
    ),
    uniqueIndex("CouponTopic_workspaceId_name_idx")
      .on(table.workspaceId, sql`lower(${table.name})`)
      .where(sql`"deletedAt" IS NULL`),
  ],
)

export const couponModel = pgTable(
  "Coupon",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    topicId: bigintAsString()
      .notNull()
      .references(() => couponTopicModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    code: text().notNull(),
    issuedContactId: bigintAsString().references(() => contactModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    issuedAt: timestamp(timestampConfig),
    usedAt: timestamp(timestampConfig),
  },
  (table) => [
    uniqueIndex("Coupon_workspaceId_code_key").on(
      table.workspaceId,
      table.code,
    ),
    uniqueIndex("Coupon_workspaceId_topicId_issuedContactId_key")
      .on(table.workspaceId, table.topicId, table.issuedContactId)
      .where(sql`${table.issuedContactId} IS NOT NULL`),
    index("Coupon_workspaceId_topicId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
      table.topicId.asc().nullsLast(),
    ),
    index("Coupon_workspaceId_topicId_issuedContactId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
      table.topicId.asc().nullsLast(),
      table.issuedContactId.asc().nullsLast(),
    ),
    index("Coupon_issuedContactId_idx").using(
      "btree",
      table.issuedContactId.asc().nullsLast(),
    ),
    index("Coupon_issuedAt_idx").using(
      "btree",
      table.issuedAt.asc().nullsLast(),
    ),
    index("Coupon_usedAt_idx").using("btree", table.usedAt.asc().nullsLast()),
    index("Coupon_workspaceId_code_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
      table.code.asc().nullsLast(),
    ),
    index("Coupon_workspaceId_topicId_issuedContactId_usedAt_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
      table.topicId.asc().nullsLast(),
      table.issuedContactId.asc().nullsLast(),
      table.usedAt.asc().nullsLast(),
    ),
  ],
)
