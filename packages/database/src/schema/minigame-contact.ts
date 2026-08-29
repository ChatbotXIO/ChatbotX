import {
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { contactModel } from "./contact"
import { minigameModel } from "./minigame"

/**
 * Tracks each contact's remaining plays for a minigame. Reading/writing
 * `remaining`/`played` and applying `playerSettings.resetPolicy` lives in
 * `MinigameContactService` (`packages/business/src/minigame`). Granting
 * bonus plays when `referrerContactId` shares successfully is still
 * unimplemented — deferred pending per-channel referral webhook support.
 */
export const minigameContactModel = pgTable(
  "MinigameContact",
  {
    ...sharedColumns,
    minigameId: bigintAsString()
      .notNull()
      .references(() => minigameModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    contactId: bigintAsString()
      .notNull()
      .references(() => contactModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    openedAt: timestamp(timestampConfig).notNull(),
    played: integer().default(0).notNull(),
    remaining: integer().default(0).notNull(),
    referrerContactId: bigintAsString().references(() => contactModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
  },
  (table) => [
    index("MinigameContact_minigameId_idx").using(
      "btree",
      table.minigameId.asc().nullsLast(),
    ),
    index("MinigameContact_contactId_idx").using(
      "btree",
      table.contactId.asc().nullsLast(),
    ),
    uniqueIndex("MinigameContact_minigameId_contactId_key").using(
      "btree",
      table.minigameId.asc().nullsLast(),
      table.contactId.asc().nullsLast(),
    ),
  ],
)
