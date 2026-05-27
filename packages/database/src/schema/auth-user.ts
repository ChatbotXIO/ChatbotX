import {
  boolean,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { sharedColumns } from "../partials/shared"

export const userModel = pgTable(
  "User",
  {
    ...sharedColumns,
    name: text(),
    email: text().notNull(),
    emailVerified: boolean().default(false).notNull(),
    image: text(),
    isAnonymous: boolean().default(false).notNull(),
    // Activity status (Respond.io paridade: Available/Busy/Offline).
    // Available e Busy são trocados manualmente pelo user; Offline é setado
    // automaticamente quando lastActiveAt > workspace user inactivity timeout
    // (MVP: sem auto-offline worker, só persistência manual).
    activityStatus: text().default("available").notNull(),
    lastActiveAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    uniqueIndex("User_email_key").using("btree", table.email.asc().nullsLast()),
  ],
)
